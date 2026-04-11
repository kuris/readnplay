/**
 * READPLAY 로컬 이미지 생성 워커 (분산 큐 모드)
 * 맥북 터미널에서 'node worker/mac-worker.js'로 실행하세요.
 */

const SERVER_URL = 'https://readplay.vercel.app'; 
const SD_API_URL = 'http://127.0.0.1:7860/sdapi/v1/txt2img'; 
const POLL_INTERVAL = 4000; // 4초마다 확인

// ✅ 중복 처리 방지 캐시 (세션 내)
const processedJobIds = new Set();
let currentJobId = null;

async function checkConnectivity() {
  console.log('🔍 로컬 SD API 연결 확인 중...');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    // options 엔드포인트로 서버 확인
    const res = await fetch(SD_API_URL.replace('/txt2img', '/options'), { 
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    if (res.ok) {
      console.log('✅ SD API 연결 성공!');
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error('❌ SD API 연결 시간 초과 (3초)');
    } else {
      console.error(`❌ SD API 연결 실패: ${e.message}`);
    }
  }
  
  console.log('\n--- Troubleshooting ---');
  console.log('1. Stable Diffusion(Draw Things 또는 A1111)이 실행 중인지 확인하세요.');
  console.log('2. API 서버가 활성화되어 있는지 확인하세요.');
  console.log(`   - Draw Things: 세팅 -> Experimental -> Enable HTTP API Server`);
  console.log(`   - A1111: 실행 시 --api 플래그 사용`);
  console.log(`3. 주소가 맞는지 확인하세요: ${SD_API_URL}`);
  console.log('-----------------------\n');
  return false;
}

console.log('🚀 READPLAY 로컬 워커 (분산 큐 모드) 가 시작되었습니다.');
console.log(`🔗 서버 주소: ${SERVER_URL}`);
console.log(`🏠 로컬 SD 주소: ${SD_API_URL}`);
console.log('---');

async function workerLoop() {
  try {
    // 1. 대기 중인 작업 하나 가져오기 (가장 오래된 것)
    const res = await fetch(`${SERVER_URL}/api/image-jobs?status=pending`);
    if (!res.ok) {
       process.stdout.write('!'); // 서버 에러 시 ! 표시
       setTimeout(workerLoop, POLL_INTERVAL);
       return;
    }

    const job = await res.json();

    // 대기 중인 작업이 없거나 이미 처리 중인 경우
    if (!job || !job.id || processedJobIds.has(job.id)) {
      process.stdout.write('.');
      setTimeout(workerLoop, POLL_INTERVAL);
      return;
    }

    currentJobId = job.id;
    console.log(`\n\n[JOB 감지] ID: ${job.id}`);
    console.log(`📝 프롬프트: ${job.prompt}`);

    // 2. 작업 상태를 'processing'으로 변경 시도
    // 분산 큐에서는 이 과정에서 기존 파일을 _processing으로 교체함
    const patchRes = await fetch(`${SERVER_URL}/api/image-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'processing' })
    });
    
    if (!patchRes.ok) {
       console.warn('⚠️ 작업 선점 실패 (이미 다른 워커가 처리 중일 수 있음)');
       processedJobIds.add(job.id); // 실패한 것도 당분간 건너뜀
       setTimeout(workerLoop, 1000);
       return;
    }

    // 3. 로컬 SD 호출
    console.log('🎨 이미지 생성 중 (Quality: 20 steps)...');
    const sdRes = await fetch(SD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: job.prompt,
        negative_prompt: "blurry, low quality, bad anatomy, text, watermark, signature, oversaturated, red tint, glowing eyes, color distortion, neon colors, abstract, cartoonish",
        width: 384,
        height: 384,
        steps: 20, // 10 -> 20으로 상향
        seed: -1,
        batch_size: 1
      })
    });

    if (!sdRes.ok) {
      throw new Error(`SD API 오류: ${sdRes.status}`);
    }

    const sdData = await sdRes.json();
    const base64Image = sdData.images[0];
    console.log('✅ 생성 완료! 서버 업로드 중...');

    // 4. 생성된 이미지를 Vercel Blob에 저장
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
      const errorBody = await saveRes.text();
      throw new Error(`이미지 업로드 실패: ${errorBody}`);
    }

    const { url } = await saveRes.json();
    console.log(`☁️ 업로드 완료: ${url}`);

    // 5. 작업 상태를 'done'으로 최종 업데이트
    await fetch(`${SERVER_URL}/api/image-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'done', resultUrl: url }) // API에서 resultUrl을 받아 result_url로 저장함
    });

    processedJobIds.add(job.id);
    console.log('🏁 작업 프로세스 완료.');
    currentJobId = null;
    
    // 캐시 관리
    if (processedJobIds.size > 200) {
      const first = processedJobIds.values().next().value;
      processedJobIds.delete(first);
    }

    setTimeout(workerLoop, 500);

  } catch (e) {
    console.error(`\n❌ 에러 발생: ${e.message}`);
    
    if (currentJobId) {
       try {
         await fetch(`${SERVER_URL}/api/image-jobs`, {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ id: currentJobId, status: 'failed', error: e.message })
         });
         processedJobIds.add(currentJobId);
       } catch (err) {
         console.error('서버 상태 업데이트 실패:', err.message);
       }
    }
    
    currentJobId = null;
    setTimeout(workerLoop, POLL_INTERVAL * 2);
  }
}

// 시작
async function start() {
  const isConnected = await checkConnectivity();
  if (isConnected) {
    workerLoop();
  } else {
    console.log('⚠️ 5초 후 다시 연결을 시도합니다...');
    setTimeout(start, 5000);
  }
}

start();
