/**
 * READPLAY 로컬 이미지 생성 워커
 * 맥북 터미널에서 'node worker/mac-worker.js'로 실행하세요.
 */

const SERVER_URL = 'https://readplay.vercel.app'; // Vercel 배포 주소로 수정 필요 시 수정
const SD_API_URL = 'http://127.0.0.1:7860/sdapi/v1/txt2img'; 
const POLL_INTERVAL = 3000; // 3초마다 확인

// ✅ 중복 처리 방지를 위한 처리된 작업 ID 캐시
const processedJobIds = new Set();
let currentJobId = null;

console.log('🚀 READPLAY 로컬 워커가 시작되었습니다.');
console.log(`🔗 서버 주소: ${SERVER_URL}`);
console.log(`🏠 로컬 SD 주소: ${SD_API_URL}`);
console.log('---');

async function workerLoop() {
  try {
    // 1. 대기 중인 작업 가져오기
    const res = await fetch(`${SERVER_URL}/api/image-jobs?status=pending`);
    const job = await res.json();

    if (!job || !job.id || processedJobIds.has(job.id)) {
      // 대기 중인 작업 없음, 유효하지 않은 작업, 또는 이미 처리한 작업
      process.stdout.write('.');
      setTimeout(workerLoop, POLL_INTERVAL);
      return;
    }

    currentJobId = job.id;
    console.log(`\n\n[JOB 감지] ID: ${job.id}`);
    console.log(`📝 프롬프트: ${job.prompt}`);

    // 2. 작업 상태를 'processing'으로 변경
    const patchRes = await fetch(`${SERVER_URL}/api/image-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'processing' })
    });
    
    if (!patchRes.ok) {
       console.warn('⚠️ 전송 상태 변경 실패, 다른 워커가 처리 중일 수 있습니다.');
       setTimeout(workerLoop, POLL_INTERVAL);
       return;
    }

    // 3. 로컬 SD(Stable Diffusion / Draw Things) 호출
    console.log('🎨 이미지 생성 중...');
    const sdRes = await fetch(SD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: job.prompt,
        negative_prompt: "blurry, low quality, bad anatomy, text, watermark, signature",
        width: 384,
        height: 384,
        steps: 10,
        seed: -1,
        batch_size: 1
      })
    });

    if (!sdRes.ok) {
      throw new Error(`SD API 오류: ${sdRes.status}`);
    }

    const sdData = await sdRes.json();
    const base64Image = sdData.images[0];
    console.log('✅ 이미지 생성 완료! 서버에 업로드 중...');

    // 4. 생성된 이미지를 서버에 저장
    const fileName = `job_${job.id}.png`;
    const saveRes = await fetch(`${SERVER_URL}/api/save-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        imageBinary: base64Image, 
        fileName, 
        mimeType: 'image/png' 
      })
    });

    if (!saveRes.ok) {
      const errorText = await saveRes.text();
      throw new Error(`이미지 저장 오류(${saveRes.status}): ${errorText}`);
    }

    const { url } = await saveRes.json();
    console.log(`☁️ 업로드 완료: ${url}`);

    // 5. 작업 완료 보고
    await fetch(`${SERVER_URL}/api/image-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'done', resultUrl: url })
    });

    processedJobIds.add(job.id);
    console.log('🏁 작업 프로세스 종료.');
    currentJobId = null;
    
    // 캐시 크기 관리 (최근 100개만 유지)
    if (processedJobIds.size > 100) {
      const firstKey = processedJobIds.values().next().value;
      processedJobIds.delete(firstKey);
    }

    setTimeout(workerLoop, 500);

  } catch (e) {
    console.error(`\n❌ 에러 발생: ${e.message}`);
    
    // 서버에 에러 상태 알림
    if (currentJobId) {
       try {
         await fetch(`${SERVER_URL}/api/image-jobs`, {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ id: currentJobId, status: 'failed', error: e.message })
         });
         processedJobIds.add(currentJobId); // 실패한 항목도 무한 재시도 방지를 위해 캐시 추가
       } catch (err) {
         console.error('서버 상태 업데이트 실패:', err.message);
       }
    }
    
    currentJobId = null;
    setTimeout(workerLoop, POLL_INTERVAL * 2);
  }
}

workerLoop();
