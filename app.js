(() => {
  const TOTAL_QUESTIONS = 10;
  const QUESTIONS_FILE = 'Q.txt';
  const APPS_SCRIPT_URL = window.QUIZ_CONFIG?.appsScriptUrl || '';

  const screens = {
    start: document.getElementById('screen-start'),
    quiz: document.getElementById('screen-quiz'),
    result: document.getElementById('screen-result')
  };

  const nameForm = document.getElementById('name-form');
  const playerNameInput = document.getElementById('player-name');
  const startButton = document.getElementById('start-button');
  const startStatus = document.getElementById('start-status');

  const questionCounter = document.getElementById('question-counter');
  const progressBar = document.getElementById('progress-bar');
  const liveScore = document.getElementById('live-score');
  const questionText = document.getElementById('question-text');
  const answersEl = document.getElementById('answers');
  const nextButton = document.getElementById('next-button');

  const finalScore = document.getElementById('final-score');
  const resultText = document.getElementById('result-text');
  const saveStatus = document.getElementById('save-status');
  const restartButton = document.getElementById('restart-button');

  let questionBank = [];
  let selectedQuestions = [];
  let currentQuestionIndex = 0;
  let score = 0;
  let playerName = '';
  let playerRow = null;
  let answerLocked = false;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      questionBank = await loadQuestions();

      if (questionBank.length < TOTAL_QUESTIONS) {
        throw new Error(`В файле должно быть не меньше ${TOTAL_QUESTIONS} вопросов.`);
      }
    } catch (error) {
      startStatus.textContent = error.message || 'Не удалось загрузить вопросы.';
      startStatus.style.color = '#fca5a5';
      startButton.disabled = true;
      return;
    }

    nameForm.addEventListener('submit', handleNameSubmit);
    nextButton.addEventListener('click', handleNextQuestion);
    restartButton.addEventListener('click', resetToStart);
  }

  async function loadQuestions() {
    const response = await fetch(QUESTIONS_FILE, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error('Не удалось открыть Q.txt. Проверьте, что файл лежит рядом с index.html.');
    }

    const rawText = await response.text();
    const blocks = rawText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n\s*\r?\n/g)
      .map((block) => block.trim())
      .filter(Boolean);

    const parsedQuestions = blocks.map(parseQuestionBlock).filter(Boolean);

    if (!parsedQuestions.length) {
      throw new Error('Q.txt прочитан, но в нём не найдено корректных блоков вопросов.');
    }

    return parsedQuestions;
  }

  function parseQuestionBlock(block) {
    const lines = block
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 4) {
      return null;
    }

    const [, question, ...optionLines] = lines;
    let correctIndex = -1;

    const options = optionLines.map((line, index) => {
      const isCorrect = /\*$/.test(line);
      const cleanText = line.replace(/\*$/, '').trim();

      if (isCorrect) {
        correctIndex = index;
      }

      return cleanText;
    });

    if (!question || options.length < 2 || correctIndex === -1) {
      return null;
    }

    return {
      question,
      options,
      correctIndex
    };
  }

  async function handleNameSubmit(event) {
    event.preventDefault();

    const rawName = playerNameInput.value.trim();
    if (!rawName) {
      startStatus.textContent = 'Введите имя участника.';
      startStatus.style.color = '#fca5a5';
      return;
    }

    if (!isAppsScriptConfigured()) {
      startStatus.textContent = 'Сначала вставьте URL веб-приложения Apps Script в config.js.';
      startStatus.style.color = '#fca5a5';
      return;
    }

    startButton.disabled = true;
    startStatus.textContent = 'Сохраняем имя...';
    startStatus.style.color = '';

    try {
      const result = await sendJsonpRequest({
        action: 'register',
        name: rawName
      });

      if (!result.ok) {
        throw new Error(result.error || 'Сервер не принял имя.');
      }

      playerName = rawName;
      playerRow = Number(result.row);
      startStatus.textContent = 'Имя сохранено. Загружаем викторину...';
      buildQuizSession();
      showScreen('quiz');
      renderQuestion();
      scrollToTop();
    } catch (error) {
      startStatus.textContent = error.message || 'Не удалось сохранить имя.';
      startStatus.style.color = '#fca5a5';
    } finally {
      startButton.disabled = false;
    }
  }

  function buildQuizSession() {
    selectedQuestions = shuffle([...questionBank]).slice(0, TOTAL_QUESTIONS);
    currentQuestionIndex = 0;
    score = 0;
    answerLocked = false;
    liveScore.textContent = String(score);
    nextButton.disabled = true;
  }

  function renderQuestion() {
    const current = selectedQuestions[currentQuestionIndex];
    if (!current) {
      finishQuiz();
      return;
    }

    answerLocked = false;
    nextButton.disabled = true;
    questionCounter.textContent = `Вопрос ${currentQuestionIndex + 1} из ${TOTAL_QUESTIONS}`;
    progressBar.style.width = `${((currentQuestionIndex + 1) / TOTAL_QUESTIONS) * 100}%`;
    questionText.textContent = current.question;
    answersEl.innerHTML = '';

    current.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-button';
      button.textContent = option;
      button.addEventListener('click', () => handleAnswer(index));
      answersEl.appendChild(button);
    });

    scrollToTop();
  }

  function handleAnswer(selectedIndex) {
    if (answerLocked) {
      return;
    }

    answerLocked = true;
    const current = selectedQuestions[currentQuestionIndex];
    const answerButtons = [...answersEl.querySelectorAll('.answer-button')];

    answerButtons.forEach((button) => {
      button.disabled = true;
    });

    if (selectedIndex === current.correctIndex) {
      score += 1;
      liveScore.textContent = String(score);
      answerButtons[selectedIndex].classList.add('is-correct');
    } else {
      answerButtons[selectedIndex].classList.add('is-wrong');
      answerButtons[current.correctIndex].classList.add('is-correct');
    }

    nextButton.disabled = false;
    nextButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleNextQuestion() {
    currentQuestionIndex += 1;

    if (currentQuestionIndex >= TOTAL_QUESTIONS) {
      finishQuiz();
      return;
    }

    renderQuestion();
  }

  async function finishQuiz() {
    showScreen('result');
    finalScore.textContent = String(score);
    resultText.textContent = `${playerName}, вы набрали ${score} из ${TOTAL_QUESTIONS}.`;
    saveStatus.textContent = 'Сохраняем результат...';
    saveStatus.style.color = '';
    scrollToTop();

    try {
      const result = await sendJsonpRequest({
        action: 'score',
        row: String(playerRow),
        score: String(score)
      });

      if (!result.ok) {
        throw new Error(result.error || 'Результат не сохранился.');
      }

      saveStatus.textContent = 'Результат сохранён в таблицу.';
      saveStatus.style.color = '#86efac';
    } catch (error) {
      saveStatus.textContent = `Не удалось отправить результат: ${error.message || 'неизвестная ошибка'}`;
      saveStatus.style.color = '#fca5a5';
    }
  }

  function resetToStart() {
    playerName = '';
    playerRow = null;
    score = 0;
    currentQuestionIndex = 0;
    selectedQuestions = [];
    answerLocked = false;
    playerNameInput.value = '';
    startStatus.textContent = '';
    saveStatus.textContent = '';
    liveScore.textContent = '0';
    progressBar.style.width = '10%';
    questionText.textContent = '';
    answersEl.innerHTML = '';
    nextButton.disabled = true;
    showScreen('start');
    scrollToTop();
    playerNameInput.focus();
  }

  function showScreen(screenName) {
    Object.entries(screens).forEach(([name, element]) => {
      element.classList.toggle('is-active', name === screenName);
    });
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function isAppsScriptConfigured() {
    return APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes('PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE');
  }

  function sendJsonpRequest(params) {
    return new Promise((resolve, reject) => {
      const callbackName = `quizCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(APPS_SCRIPT_URL);
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Истекло время ожидания ответа от Apps Script.'));
      }, 15000);

      Object.entries({ ...params, prefix: callbackName }).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      window[callbackName] = (data) => {
        window.clearTimeout(timeout);
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        window.clearTimeout(timeout);
        cleanup();
        reject(new Error('Скрипт Google не ответил. Проверьте URL веб-приложения.'));
      };

      function cleanup() {
        delete window[callbackName];
        script.remove();
      }

      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }
})();
