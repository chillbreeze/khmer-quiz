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
};

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
  state.correct = 0;
  state.total   = 0;
  state.streak  = 0;
  state.answered = false;
  scoreCorrect.textContent = 0;
  scoreTotal.textContent   = `0/${QUIZ_LENGTH}`;
  streakEl.textContent     = '';
  $('results').classList.add('hidden');
  $('card').classList.remove('hidden');
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
  if (state.total >= QUIZ_LENGTH) {
    btnNext.textContent = 'See Results →';
  } else {
    btnNext.textContent = 'Next →';
  }
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
  }

  afterAnswer();
}


/* ── Next button ───────────────────────────────────────────────── */
btnNext.addEventListener('click', () => {
  if (state.total >= QUIZ_LENGTH) {
    showResults();
  } else {
    loadQuestion();
  }
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
  $('card').classList.add('hidden');
  const pct = Math.round((state.correct / QUIZ_LENGTH) * 100);
  let message;
  if (pct === 100) message = 'Perfect score!';
  else if (pct >= 80) message = 'Great work!';
  else if (pct >= 60) message = 'Good effort!';
  else message = 'Keep practising!';

  $('results-score').textContent = `${state.correct} / ${QUIZ_LENGTH}`;
  $('results-pct').textContent   = `${pct}%`;
  $('results-msg').textContent   = message;
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
  document.getElementById('landing').classList.remove('hidden');
  document.querySelector('header').classList.add('hidden');
  document.querySelector('main').classList.add('hidden');
  $('results').classList.add('hidden');
}

document.getElementById('logoHome').addEventListener('click', showLanding);

document.getElementById('btnStart').addEventListener('click', () => {
  document.getElementById('landing').classList.add('hidden');
  document.querySelector('header').classList.remove('hidden');
  document.querySelector('main').classList.remove('hidden');
  startQuiz();
});

// Reset to landing on every page load, including bfcache restores
window.addEventListener('pageshow', showLanding);
