/**
 * READPLAY 로컬 이미지 생성 워커
 * 맥북 터미널에서 'node worker/mac-worker.js'로 실행하세요.
 */

const SERVER_URL = 'https://readplay.vercel.app'; // Vercel 배포 주소로 수정 필요 시 수정
const SD_API_URL = 'http://127.0.0.1:7860/sdapi/v1/txt2img'; 
const POLL_INTERVAL = 3000; // 3초마다 확인

console.log('🚀 READPLAY 로컬 워커가 시작되었습니다.');
console.log(`🔗 서버 주소: ${SERVER_URL}`);
console.log(`🏠 로컬 SD 주소: ${SD_API_URL}`);
console.log('---');

async function workerLoop() {
  try {
    // 1. 대기 중인 작업 가져오기
    const res = await fetch(`${SERVER_URL}/api/image-jobs?status=pending`);
    const job = await res.json();

    if (!job) {
      // 대기 중인 작업 없음
      process.stdout.write('.');
      setTimeout(workerLoop, POLL_INTERVAL);
      return;
    }

    console.log(`\n\n[JOB 감지] ID: ${job.id}`);
    console.log(`📝 프롬프트: ${job.prompt}`);

    // 2. 작업 상태를 'processing'으로 변경
    await fetch(`${SERVER_URL}/api/image-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'processing' })
    });

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
      throw new Error(`이미지 저장 오류: ${saveRes.status}`);
    }

    const { url } = await saveRes.json();
    console.log(`☁️ 업로드 완료: ${url}`);

    // 5. 작업 완료 보고
    await fetch(`${SERVER_URL}/api/image-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'done', resultUrl: url })
    });

    console.log('🏁 작업 프로세스 종료.');
    setTimeout(workerLoop, 500);

  } catch (e) {
    console.error(`\n❌ 에러 발생: ${e.message}`);
    // 에러 발생 시 잠시 대기 후 재시작
    setTimeout(workerLoop, POLL_INTERVAL * 2);
  }
}

workerLoop();
