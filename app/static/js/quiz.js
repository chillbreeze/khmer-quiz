/* ── State ─────────────────────────────────────────────────────── */
const QUIZ_LENGTH = 20;

let state = {
  direction: 'random',
  correct:   0,
  total:     0,
  streak:    0,
  currentVocabId: null,
  currentDirection: null,
  answered: false,
  mode: 'zen', // 'zen' | 'timed'
};

let timerInterval  = null;
let startTime      = null;
let elapsedSeconds = 0;

function formatTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ── DOM refs ──────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const prompt       = $('prompt');
const cardDir      = $('cardDir');
const choicesWrap  = $('choicesWrap');
const feedback     = $('feedback');
const btnNext      = $('btnNext');
const scoreCorrect = $('scoreCorrect');
const scoreTotal   = $('scoreTotal');
const streakEl     = $('streak');

/* ── Toggle controls ───────────────────────────────────────────── */
document.querySelectorAll('#dirToggle .tog').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#dirToggle .tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.direction = btn.dataset.val;
    loadQuestion();
  });
});

/* ── Start / restart quiz ──────────────────────────────────────── */
function startQuiz() {
  state.correct  = 0;
  state.total    = 0;
  state.streak   = 0;
  state.answered = false;
  scoreCorrect.textContent = 0;
  scoreTotal.textContent   = `0/${QUIZ_LENGTH}`;
  streakEl.textContent     = '';
  $('results').classList.add('hidden');
  $('card').classList.remove('hidden');

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  if (state.mode === 'timed') {
    startTime      = Date.now();
    elapsedSeconds = 0;
    $('timer').textContent = '0:00';
    $('timer').classList.remove('hidden');
    $('timerSep').classList.remove('hidden');
    timerInterval = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      $('timer').textContent = formatTime(elapsedSeconds);
    }, 1000);
  } else {
    $('timer').classList.add('hidden');
    $('timerSep').classList.add('hidden');
  }

  loadQuestion();
}

/* ── Load question ─────────────────────────────────────────────── */
async function loadQuestion() {
  state.answered = false;
  resetUI();
  prompt.textContent = '…';

  try {
    const res  = await fetch(`/api/question?mode=choice&direction=${state.direction}`);
    const data = await res.json();
    if (data.error) { prompt.textContent = data.error; return; }

    state.currentVocabId   = data.id;
    state.currentDirection = data.direction;

    cardDir.textContent = data.direction === 'en_to_km'
      ? 'English → KH phonetic'
      : 'KH phonetic → English';

    prompt.textContent = data.prompt;
    prompt.className   = 'prompt';

    renderChoices(data.choices);
  } catch (e) {
    prompt.textContent = 'Error loading question.';
    console.error(e);
  }
}

/* ── Render choices ────────────────────────────────────────────── */
function renderChoices(choices) {
  choicesWrap.innerHTML = '';
  choicesWrap.classList.remove('hidden');
  choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.answer = text;
    btn.innerHTML = `<span class="choice-num">${i + 1}</span>${text}`;
    btn.addEventListener('click', () => handleChoice(btn, text));
    choicesWrap.appendChild(btn);
  });
}

/* ── After answering: check if quiz is done ────────────────────── */
function afterAnswer() {
  btnNext.classList.remove('hidden');
  btnNext.textContent = state.total >= QUIZ_LENGTH ? 'See Results →' : 'Next →';
}

/* ── Penalty animation ─────────────────────────────────────────── */
const PENALTY_SECONDS = 5;

function showPenalty() {
  const el = $('timerPenalty');
  el.textContent = `+${PENALTY_SECONDS}s`;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');

  const timerEl = $('timer');
  timerEl.style.color = '#e05c5c';
  setTimeout(() => { timerEl.style.color = ''; }, 1400);
}

/* ── Handle choice click ───────────────────────────────────────── */
async function handleChoice(clickedBtn, chosen) {
  if (state.answered) return;
  state.answered = true;

  const res  = await fetch('/api/check', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chosen }),
  });
  const data = await res.json();

  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);

  if (data.correct) {
    clickedBtn.classList.add('correct');
    showFeedback(true);
    bumpScore(true);
  } else {
    clickedBtn.classList.add('wrong');
    document.querySelectorAll('.choice-btn').forEach(b => {
      if (b.dataset.answer === data.answer) b.classList.add('correct');
    });
    showFeedback(false, data.answer);
    bumpScore(false);
    if (state.mode === 'timed') {
      startTime -= PENALTY_SECONDS * 1000;
      showPenalty();
    }
  }

  afterAnswer();
}

/* ── Next button ───────────────────────────────────────────────── */
btnNext.addEventListener('click', () => {
  if (state.total >= QUIZ_LENGTH) showResults();
  else loadQuestion();
});

document.addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && state.answered) {
    e.preventDefault();
    if (state.total >= QUIZ_LENGTH) showResults();
    else loadQuestion();
  }
  if (['1','2','3','4'].includes(e.key) && !state.answered) {
    const btn = choicesWrap.querySelectorAll('.choice-btn')[parseInt(e.key) - 1];
    if (btn) btn.click();
  }
});

/* ── Score & streak ────────────────────────────────────────────── */
function bumpScore(correct) {
  state.total++;
  if (correct) {
    state.correct++;
    state.streak++;
  } else {
    state.streak = 0;
  }
  scoreCorrect.textContent = state.correct;
  scoreTotal.textContent   = `${state.total}/${QUIZ_LENGTH}`;
  streakEl.textContent     = state.streak >= 3 ? `🔥 ${state.streak}` : '';
}

/* ── Feedback ──────────────────────────────────────────────────── */
function showFeedback(correct, correctAnswer) {
  feedback.classList.remove('hidden', 'correct-fb', 'wrong-fb');
  if (correct) {
    feedback.textContent = '✓ Correct!';
    feedback.classList.add('correct-fb');
  } else {
    feedback.textContent = `✗ Answer: ${correctAnswer}`;
    feedback.classList.add('wrong-fb');
  }
  feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Results screen ────────────────────────────────────────────── */
function showResults() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  $('card').classList.add('hidden');
  const pct = Math.round((state.correct / QUIZ_LENGTH) * 100);
  let message;
  if (pct === 100)      message = 'Perfect score!';
  else if (pct >= 80)   message = 'Great work!';
  else if (pct >= 60)   message = 'Good effort!';
  else                  message = 'Keep practising!';

  $('results-score').textContent = `${state.correct} / ${QUIZ_LENGTH}`;
  $('results-pct').textContent   = `${pct}%`;
  $('results-msg').textContent   = message;

  if (state.mode === 'timed') {
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const stored    = localStorage.getItem('khmerQuizBestTime');
    const isNewBest = !stored || elapsedSeconds < parseInt(stored, 10);
    if (isNewBest) localStorage.setItem('khmerQuizBestTime', elapsedSeconds);

    $('results-time').textContent = formatTime(elapsedSeconds);
    $('results-best').textContent = isNewBest
      ? `${formatTime(elapsedSeconds)} (new best!)`
      : formatTime(parseInt(stored, 10));
    $('results-times').classList.remove('hidden');
  } else {
    $('results-times').classList.add('hidden');
  }

  $('results').classList.remove('hidden');
}

$('btnRestart').addEventListener('click', startQuiz);

/* ── Reset UI ──────────────────────────────────────────────────── */
function resetUI() {
  choicesWrap.innerHTML = '';
  choicesWrap.classList.add('hidden');
  feedback.classList.add('hidden');
  btnNext.classList.add('hidden');
  btnNext.textContent = 'Next →';
}

/* ── Init ──────────────────────────────────────────────────────── */
function showLanding() {
  $('landing').classList.remove('hidden');
  document.querySelector('header').classList.add('hidden');
  document.querySelector('main').classList.add('hidden');
  $('results').classList.add('hidden');
}

$('logoHome').addEventListener('click', showLanding);

function launchQuiz(mode) {
  state.mode = mode;
  $('landing').classList.add('hidden');
  document.querySelector('header').classList.remove('hidden');
  document.querySelector('main').classList.remove('hidden');
  startQuiz();
}

$('btnZen').addEventListener('click',   () => launchQuiz('zen'));
$('btnTimed').addEventListener('click', () => launchQuiz('timed'));

// Reset to landing on every page load, including bfcache restores
window.addEventListener('pageshow', showLanding);
