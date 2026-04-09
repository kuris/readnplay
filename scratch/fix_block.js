    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { 
          maxOutputTokens: 8192, 
          temperature: 0.75,
          topP: 0.95 
        }
      })
    });

    if (!res.ok) {
      if (res.status === 429 && retryCount < maxRetries) {
        log('속도 제한 발생. 3초 후 재시도...', 'err');
        await new Promise(r => setTimeout(r, 3000));
        return generate(retryCount + 1);
      }
      throw new Error(`API 오류 ${res.status}`);
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    let jsonText = raw.trim()
      .replace(/^```+(?:json)?\s*/i, '')
      .replace(/\s*```+\s*$/i, '')
      .trim();

    const objMatch = jsonText.match(/\{[\s\S]*\}/);
    if (objMatch) jsonText = objMatch[0];

    // Stage 3: 게임 완성
    setStage(3);
    
    // 💾 기존 캐릭터 이미지 정보 백업
    const oldChars = (gameData && gameData.characters) ? [...gameData.characters] : [];
    
    gameData = JSON.parse(jsonText);

    // 🔗 기존 이미지 주소 복원
    if (gameData.characters && oldChars.length > 0) {
      gameData.characters.forEach(newChar => {
        const match = oldChars.find(oc => oc.id === newChar.id || oc.name === newChar.name);
        if (match && match.avatar_url && match.avatar_url.includes('vercel-storage.com')) {
          newChar.avatar_url = match.avatar_url;
          newChar.orig_pollination_url = match.orig_pollination_url;
        }
      });
    }
    
    if (retryCount === 0) {
      try {
        if (selectedMode === 'visual_novel' && gameData.characters) {
          log('캐릭터 전원 출석 대기 중...', 'warn');
          await ensureCharacterPortraits(gameData.characters);
        }

        await fetch('/api/game-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cacheKey, gameData })
        });
        console.log('Vercel Blob 캐싱 완료');
      } catch(e) {
        console.warn('캐시 업로드 실패', e);
      }
    }

    gameStartTime = Date.now();
    log('모든 준비 완료! 게임을 시작합니다.', 'ok');
    completeStages();
    setTimeout(startGame, 800);
    
  } catch(e) {
    log('오류: ' + e.message, 'err');
    if (retryCount < maxRetries) {
      log('잠시 후 재시도합니다...', 'err');
      setTimeout(() => generate(retryCount + 1), 2000);
    } else {
      log('최종 실패. 다시 시작해주세요.', 'err');
    }
  }
}

// 🖼️ 이미지 로드 완료를 기다리는 헬퍼 함수
function waitForImage(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    setTimeout(() => resolve(false), 10000);
  });
}

async function ensureCharacterPortraits(characters) {
  const total = characters.length;
  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    
    if (char.avatar_url && char.avatar_url.includes('vercel-storage.com')) {
      log(`[${i + 1}/${total}] ${char.name} (저장됨) 출석 완료!`);
      continue;
    }
    if (char.orig_pollination_url) {
      log(`[${i + 1}/${total}] ${char.name} (생성됨) 출석 완료!`);
      continue;
    }

    if (char.image_prompt) {
      let success = false;
      let retryCount = 0;
      const maxImageRetries = 2;

      while (!success && retryCount <= maxImageRetries) {
        if (retryCount > 0) {
          log(`[${i + 1}/${total}] ${char.name} 이미지 재시도 중 (${retryCount}/${maxImageRetries})...`, 'err');
          await new Promise(r => setTimeout(r, 2000));
        } else {
          log(`[${i + 1}/${total}] ${char.name} 그리는 중... (잠시만 기다려주세요)`);
        }

        const seed = Math.floor(Math.random() * 1000000);
        const finalPrompt = `${char.image_prompt}, high quality, solid pure white background, clean edges`;
        const pollinationUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=384&height=384&nologo=true&seed=${seed}`;
        
        char.orig_pollination_url = pollinationUrl;
        char.avatar_url = pollinationUrl; 
        renderCharacterPanel(); 

        success = await waitForImage(pollinationUrl);
        if (!success) retryCount++;
        await new Promise(r => setTimeout(r, 600));
      }
      
      if (!success) {
        log(`[알림] ${char.name}의 이미지를 불러오지 못해 기본 아이콘으로 대체합니다.`, 'warn');
      }
    }
  }
  log(`✨ 전원 출석 완료! (총 ${total}명)`, 'ok');
}
