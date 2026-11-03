const manifestCache = new Map();

const GENRES = [
  ['all', '전체'],
  ['ccm', 'CCM / 찬양'],
  ['kpop', 'K-POP 스타일'],
  ['ballad', '감성 발라드'],
  ['piano', '피아노 / 연주곡'],
  ['healing', '힐링 음악'],
  ['test', '연결 시험']
];

const formatTime = (value) => {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const n = Math.floor(value);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

function safeAudioUrl(file, manifestUrl) {
  const manifestBase = new URL(manifestUrl, document.baseURI);
  const url = new URL(file, manifestBase);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('음원 주소는 HTTP 또는 HTTPS여야 합니다.');
  }
  return url.href;
}

async function readManifest(url, force = false) {
  if (!force && manifestCache.has(url)) return manifestCache.get(url);
  const request = fetch(url, { cache: force ? 'reload' : 'default' })
    .then((response) => {
      if (!response.ok) throw new Error(`음악 목록을 불러오지 못했어요. (HTTP ${response.status})`);
      return response.json();
    })
    .then((data) => {
      if (!data || !Array.isArray(data.tracks)) throw new Error('music.json에 tracks 배열이 없습니다.');
      return data;
    });
  manifestCache.set(url, request);
  try { return await request; }
  catch (error) { manifestCache.delete(url); throw error; }
}

function addStyles() {
  if (document.getElementById('grace-music-player-style')) return;
  const style = document.createElement('style');
  style.id = 'grace-music-player-style';
  style.textContent = `
  .gmp{--gmp-ink:#f7f0df;--gmp-muted:#c4c2cc;--gmp-gold:#e6d19a;--gmp-panel:#111e37;box-sizing:border-box;color:var(--gmp-ink);font:14px/1.45 system-ui,-apple-system,"Malgun Gothic",sans-serif;background:linear-gradient(155deg,#1a2a49,#10192c 72%);border:1px solid #d8c18b;border-radius:22px;padding:20px;box-shadow:0 16px 48px #07102066;width:100%;max-width:520px}
  .gmp *{box-sizing:border-box}.gmp h2{font:600 21px/1.2 Georgia,serif;letter-spacing:.03em;margin:0}.gmp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.gmp-kicker{font-size:10px;letter-spacing:.16em;color:var(--gmp-gold);margin-bottom:6px}.gmp-subtitle{font-size:12px;color:var(--gmp-muted);margin:7px 0 16px}.gmp-select{width:100%;padding:10px 12px;background:#202d45;color:var(--gmp-ink);border:1px solid #677185;border-radius:12px;font:inherit;margin-bottom:10px}.gmp-list{display:grid;gap:6px;max-height:230px;overflow:auto;padding:0 3px 0 0;margin:0;list-style:none}.gmp-track{width:100%;min-height:43px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:9px 11px;border:1px solid #ffffff18;border-radius:12px;background:#ffffff08;color:var(--gmp-ink);font:inherit;cursor:pointer}.gmp-track:hover:not(:disabled),.gmp-track[aria-pressed="true"]{background:#d9c18d20;border-color:#d9c18d99}.gmp-track:disabled{cursor:not-allowed;opacity:.48}.gmp-track-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gmp-track-meta{flex:none;color:var(--gmp-muted);font-size:11px}.gmp-now{min-height:45px;padding:10px 2px 5px;color:var(--gmp-muted);font-size:12px}.gmp-controls{display:flex;align-items:center;justify-content:center;gap:8px;margin:8px 0}.gmp button.gmp-btn{min-height:40px;padding:8px 13px;border:1px solid #d8c18b77;border-radius:13px;background:#25344e;color:var(--gmp-ink);font:inherit;cursor:pointer}.gmp button.gmp-btn:hover:not(:disabled){background:#354967}.gmp button.gmp-play{background:var(--gmp-gold);color:#1d2940;border-color:var(--gmp-gold);font-weight:700;min-width:94px}.gmp button:disabled{opacity:.45;cursor:not-allowed}.gmp-progress{display:grid;grid-template-columns:40px 1fr 40px;gap:8px;align-items:center;color:var(--gmp-muted);font-size:11px}.gmp-progress input{width:100%;accent-color:var(--gmp-gold)}.gmp-volume{display:flex;align-items:center;justify-content:center;gap:10px;font-size:12px;color:var(--gmp-muted);margin-top:9px}.gmp-volume input{width:130px;accent-color:var(--gmp-gold)}.gmp-status{min-height:21px;padding-top:8px;color:var(--gmp-muted);font-size:11px;text-align:center}.gmp-error{color:#ffc6bd}.gmp-retry{display:none;margin:6px auto 0!important}.gmp-retry[data-visible="true"]{display:block}.gmp button:focus-visible,.gmp select:focus-visible,.gmp input:focus-visible{outline:3px solid #f0d78f;outline-offset:2px}
  @media(max-width:600px){.gmp{padding:16px;border-radius:18px}.gmp h2{font-size:19px}.gmp-list{max-height:190px}.gmp button.gmp-btn{min-height:44px;padding:9px 12px}.gmp-controls{gap:6px}.gmp-progress{grid-template-columns:34px 1fr 34px}}
  `;
  document.head.append(style);
}

/**
 * One instance per listening booth. Each instance owns its own HTMLAudioElement,
 * selected track and volume; sharing the small music.json cache does not share playback.
 */
export function createMusicPlayer({ mount, manifestUrl, onStateChange = () => {}, initialVolume = 0.42 } = {}) {
  if (!(mount instanceof Element)) throw new TypeError('mount 요소가 필요합니다.');
  if (!manifestUrl) throw new TypeError('manifestUrl이 필요합니다.');
  addStyles();

  const root = document.createElement('section');
  root.className = 'gmp';
  root.setAttribute('aria-label', '별빛 음악당 개인 음악 플레이어');
  root.innerHTML = `
    <div class="gmp-head"><div><div class="gmp-kicker">STARLIGHT MUSIC HALL</div><h2>나만의 음악 부스</h2></div></div>
    <p class="gmp-subtitle">곡을 골라 재생을 누르면 이 부스에서만 음악이 흘러요.</p>
    <select class="gmp-select" aria-label="장르별 음악 목록"></select>
    <ul class="gmp-list" aria-label="음악 목록"></ul>
    <div class="gmp-now" aria-live="polite">음악 목록을 불러오는 중…</div>
    <div class="gmp-progress"><span data-current>0:00</span><input data-seek type="range" min="0" max="1000" value="0" aria-label="재생 위치" disabled><span data-duration>0:00</span></div>
    <div class="gmp-controls">
      <button class="gmp-btn" data-prev type="button" aria-label="이전 곡" disabled>이전</button>
      <button class="gmp-btn gmp-play" data-play type="button" disabled>재생</button>
      <button class="gmp-btn" data-stop type="button" aria-label="정지" disabled>정지</button>
      <button class="gmp-btn" data-next type="button" aria-label="다음 곡" disabled>다음</button>
    </div>
    <label class="gmp-volume">음량 <input data-volume type="range" min="0" max="100" value="42" aria-label="음량"></label>
    <div class="gmp-status" data-status role="status" aria-live="polite"></div>
    <button class="gmp-btn gmp-retry" data-retry data-visible="false" type="button">다시 불러오기</button>
  `;
  mount.replaceChildren(root);

  const $ = (selector) => root.querySelector(selector);
  const genreSelect = $('.gmp-select'), list = $('.gmp-list'), now = $('.gmp-now'), status = $('[data-status]');
  const playButton = $('[data-play]'), stopButton = $('[data-stop]'), prevButton = $('[data-prev]'), nextButton = $('[data-next]');
  const seek = $('[data-seek]'), volume = $('[data-volume]'), retryButton = $('[data-retry]');
  const currentLabel = $('[data-current]'), durationLabel = $('[data-duration]');
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = Math.max(0, Math.min(1, Number(initialVolume)));
  volume.value = String(Math.round(audio.volume * 100));

  let manifest = null, tracks = [], visibleTracks = [], selectedId = null, activeUrl = '', state = 'loading', destroyed = false, seekByUser = false;
  const listeners = [];
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('gmp-error', isError);
    retryButton.dataset.visible = String(isError && (!manifest || Boolean(selectedId)));
    onStateChange({ state, message, track: getSelectedTrack() });
  };
  const getSelectedTrack = () => tracks.find((track) => track.id === selectedId) || null;
  const available = (track) => Boolean(track && typeof track.file === 'string' && track.file.trim());
  const stopActiveAudio = (reset = true) => {
    audio.pause();
    if (reset) { try { audio.currentTime = 0; } catch {} }
    activeUrl = '';
  };

  function renderGenreOptions() {
    const present = new Set(tracks.map((t) => t.genre));
    genreSelect.replaceChildren(...GENRES.filter(([id]) => id === 'all' || present.has(id)).map(([id, label]) => {
      const option = document.createElement('option'); option.value = id; option.textContent = label; return option;
    }));
  }

  function renderTracks() {
    const genre = genreSelect.value || 'all';
    visibleTracks = tracks.filter((track) => genre === 'all' || track.genre === genre);
    list.replaceChildren();
    if (!visibleTracks.length) {
      const li = document.createElement('li'); li.className = 'gmp-track-meta'; li.textContent = '이 장르에 등록된 곡이 없어요.'; list.append(li); return;
    }
    for (const track of visibleTracks) {
      const li = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'gmp-track';
      button.dataset.trackId = track.id;
      button.disabled = !available(track);
      button.setAttribute('aria-pressed', String(track.id === selectedId));
      const title = document.createElement('span'); title.className = 'gmp-track-title'; title.textContent = track.title || track.id;
      const meta = document.createElement('span'); meta.className = 'gmp-track-meta';
      meta.textContent = available(track) ? (track.durationSeconds ? formatTime(track.durationSeconds) : '재생 가능') : '파일 준비 중';
      button.append(title, meta); button.addEventListener('click', () => selectTrack(track.id));
      li.append(button); list.append(li);
    }
  }

  function syncTrackButtons() {
    for (const button of list.querySelectorAll('.gmp-track')) {
      button.setAttribute('aria-pressed', String(button.dataset.trackId === selectedId));
    }
    const hasTrack = available(getSelectedTrack());
    playButton.disabled = !hasTrack;
    stopButton.disabled = !hasTrack;
    prevButton.disabled = !hasTrack || visibleTracks.length < 2;
    nextButton.disabled = !hasTrack || visibleTracks.length < 2;
  }

  function selectTrack(id) {
    const track = tracks.find((item) => item.id === id);
    if (!available(track)) return;
    stopActiveAudio(true);
    selectedId = track.id;
    state = 'ready';
    now.textContent = `선택한 곡: ${track.title}`;
    currentLabel.textContent = '0:00'; durationLabel.textContent = formatTime(track.durationSeconds);
    seek.value = '0'; seek.disabled = true;
    playButton.textContent = '재생';
    setStatus('재생 버튼을 누르면 이 곡만 불러옵니다.');
    renderTracks(); syncTrackButtons();
  }

  async function playSelected() {
    const track = getSelectedTrack();
    if (!available(track)) { setStatus('먼저 재생 가능한 곡을 선택해 주세요.'); return; }
    try {
      const url = safeAudioUrl(track.file, manifestUrl);
      if (activeUrl !== url) {
        stopActiveAudio(true);
        audio.src = url;
        activeUrl = url;
        audio.load();
      }
      state = 'loading'; playButton.disabled = true; playButton.textContent = '불러오는 중';
      setStatus('선택한 곡을 불러오는 중…');
      await audio.play();
      state = 'playing'; playButton.disabled = false; playButton.textContent = '일시정지';
      setStatus('재생 중');
    } catch (error) {
      state = 'error'; playButton.disabled = false; playButton.textContent = '재시도';
      setStatus(error?.name === 'NotAllowedError' ? '브라우저에서 재생이 막혔어요. 재생을 다시 눌러 주세요.' : '음악을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.', true);
    }
  }

  function moveTrack(direction) {
    if (!visibleTracks.length) return;
    const current = visibleTracks.findIndex((track) => track.id === selectedId);
    const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
    for (let step = 1; step <= visibleTracks.length; step++) {
      const index = (start + direction * step + visibleTracks.length * 2) % visibleTracks.length;
      if (available(visibleTracks[index])) {
        const wasPlaying = state === 'playing' || state === 'loading';
        selectTrack(visibleTracks[index].id);
        if (wasPlaying) void playSelected();
        return;
      }
    }
    setStatus('이 장르에 재생 가능한 곡이 없어요.');
  }

  function listen(target, event, handler) { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); }
  listen(genreSelect, 'change', () => renderTracks());
  listen(playButton, 'click', () => { if (state === 'playing') { audio.pause(); return; } void playSelected(); });
  listen(stopButton, 'click', () => { stopActiveAudio(true); state = 'ready'; playButton.textContent = '재생'; currentLabel.textContent = '0:00'; seek.value = '0'; setStatus('정지했어요.'); });
  listen(prevButton, 'click', () => moveTrack(-1));
  listen(nextButton, 'click', () => moveTrack(1));
  listen(retryButton, 'click', () => { if (!manifest) void load({ force: true }); else void playSelected(); });
  listen(volume, 'input', () => { audio.volume = Number(volume.value) / 100; });
  listen(seek, 'input', () => {
    seekByUser = true;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Number(seek.value) / 1000 * audio.duration;
      currentLabel.textContent = formatTime(audio.currentTime);
    }
  });
  listen(seek, 'change', () => { seekByUser = false; });
  listen(audio, 'playing', () => { state = 'playing'; playButton.disabled = false; playButton.textContent = '일시정지'; setStatus('재생 중'); });
  listen(audio, 'waiting', () => { if (!destroyed) { state = 'loading'; playButton.disabled = true; playButton.textContent = '불러오는 중'; setStatus('음악을 불러오는 중…'); } });
  listen(audio, 'pause', () => { if (state === 'playing' || state === 'loading') { state = 'paused'; playButton.disabled = false; playButton.textContent = '재생'; setStatus('일시정지'); } });
  listen(audio, 'loadedmetadata', () => { durationLabel.textContent = formatTime(audio.duration); seek.disabled = false; });
  listen(audio, 'timeupdate', () => {
    currentLabel.textContent = formatTime(audio.currentTime);
    if (!seekByUser && Number.isFinite(audio.duration) && audio.duration > 0) seek.value = String(Math.round(audio.currentTime / audio.duration * 1000));
  });
  listen(audio, 'ended', () => moveTrack(1));
  listen(audio, 'error', () => {
    if (destroyed || !activeUrl) return;
    state = 'error'; playButton.disabled = false; playButton.textContent = '재시도';
    setStatus('곡을 불러오지 못했어요. 파일 경로와 인터넷 연결을 확인해 주세요.', true);
  });

  async function load({ force = false } = {}) {
    state = 'loading'; setStatus('음악 목록을 불러오는 중…');
    try {
      manifest = await readManifest(manifestUrl, force);
      tracks = manifest.tracks.map((track) => ({
        ...track,
        file: typeof track.file === 'string' && track.file.trim() ? track.file.trim() : null
      }));
      renderGenreOptions();
      if (genreSelect.options.length) genreSelect.value = 'all';
      renderTracks();
      const first = tracks.find(available);
      if (first) selectTrack(first.id);
      else { state = 'ready'; now.textContent = '곡 파일을 준비 중이에요.'; setStatus('음악 목록은 준비됐어요. 업로드된 곡이 아직 없습니다.'); }
      return tracks.length;
    } catch (error) {
      state = 'error'; now.textContent = error.message || '음악 목록을 불러오지 못했어요.';
      setStatus('목록 연결에 실패했어요. 다시 불러와 주세요.', true);
      return 0;
    }
  }

  const api = {
    load,
    play: playSelected,
    pause() { audio.pause(); },
    stop() { stopActiveAudio(true); state = 'ready'; playButton.textContent = '재생'; currentLabel.textContent = '0:00'; seek.value = '0'; setStatus('정지했어요.'); },
    next: () => moveTrack(1),
    previous: () => moveTrack(-1),
    setVolume(value) { audio.volume = Math.max(0, Math.min(1, Number(value))); volume.value = String(Math.round(audio.volume * 100)); },
    getState() { return { state, selectedId, track: getSelectedTrack(), volume: audio.volume }; },
    destroy() {
      if (destroyed) return; destroyed = true;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      for (const remove of listeners) remove();
      root.remove();
    }
  };
  void load();
  return api;
}

export { GENRES };
