/* 背单词闯关 · 屏幕专用（不收集数据，全部在浏览器里跑）
 *
 * 设计目标：让一年级小孩愿意坐下来点。所以
 *   - 全程点按，不需要打字（一年级打不了字）
 *   - 每关只问一件事，答对立刻有反馈
 *   - 答错不惩罚：不扣分、不红屏，给台阶让孩子自己想出来
 *   - 音节关是「可选关卡」：没有音节数据的词自动跳过，不影响流程
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (t, c, x) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (x != null) n.textContent = x;
    return n;
  };
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); };

  var SK = 'learn_state_v1';     // 进度（本机）
  var WK = 'words_wrong_v1';     // 生词本，跟 words/ 页面共用
  var MAX_STARS = 5;

  /* ---------- 状态 ---------- */
  var S = {
    queue: [],      // 待练的词条
    i: 0,           // 当前词
    step: 0,        // 当前关
    steps: [],      // 这一轮的关卡序列
    stars: 0,       // 当前连对
    total: 0,       // 总星数
    miss: [],       // 这一轮答错的词
    solved: 0,      // 一次过关的词数
    locked: false,  // 反馈中，锁住输入
    confettiUntil: 0
  };

  /* ---------- 存读 ---------- */
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function wrongList() { return load(WK, []); }
  function addWrong(w) {
    var a = wrongList();
    if (a.indexOf(w) < 0) { a.push(w); save(WK, a); }
  }

  /* ---------- 发音 ----------
   * 浏览器 TTS。之前 words/ 用的 dictionaryapi.dev 已整站不通（HTTP 522 / 超时），
   * 这里零依赖，且能调速 —— 慢速反而是拼读练习要的。
   */
  var voices = [];
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    if (!voices.length) voices = speechSynthesis.getVoices() || [];
    // 优先美音，其次任意英语
    return voices.filter(function (v) { return /en[-_]US/i.test(v.lang); })[0]
      || voices.filter(function (v) { return /^en/i.test(v.lang); })[0]
      || null;
  }
  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = function () { voices = speechSynthesis.getVoices() || []; };
    pickVoice();
  }
  function speak(text, rate, btn) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate || 0.85;
      var v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      if (btn) {
        btn.classList.add('playing');
        u.onend = u.onerror = function () { btn.classList.remove('playing'); };
        setTimeout(function () { btn.classList.remove('playing'); }, 2600);
      }
      speechSynthesis.speak(u);
    } catch (e) { }
  }
  function speakBtn(text, small, rate) {
    var b = el('button', 'speak' + (small ? ' small' : ''), '🔊');
    b.title = '听 ' + text;
    b.setAttribute('aria-label', '朗读 ' + text);
    b.addEventListener('click', function () { speak(text, rate || 0.85, b); });
    return b;
  }

  /* ---------- 音效（Web Audio，无资源文件） ---------- */
  var AC = null;
  function ac() {
    if (AC) return AC;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
    return AC;
  }
  function tone(freq, at, dur, vol) {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(c.destination);
    var t0 = c.currentTime + at;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(kind) {
    var c = ac(); if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) { } }
    if (kind === 'ok') { tone(660, 0, .12, .18); tone(880, .09, .16, .16); }
    else if (kind === 'cheer') { tone(523, 0, .13, .16); tone(659, .09, .13, .16); tone(784, .18, .22, .18); }
    else if (kind === 'nudge') { tone(392, 0, .13, .12); tone(330, .11, .16, .11); }
    else if (kind === 'tap') { tone(1100, 0, .05, .07); }
  }

  /* ---------- 词条 ---------- */
  function lookup(w) {
    var k = norm(w);
    if (window.UNIT1 && window.UNIT1[k]) {
      var u = window.UNIT1[k];
      return { w: w, ipa: u.ipa || '', pos: u.pos || '', syl: u.syl || '',
               zh: u.zh || '', en: u.en || '', cn: u.cn || '' };
    }
    var e = window.ENZH && window.ENZH[k];
    if (e) return { w: w, ipa: (e[0] || '').replace(/\./g, ' ').trim(), pos: e[1] || '',
                    syl: '', zh: e[2] || '', en: '', cn: '' };
    return { w: w, ipa: '', pos: '', syl: '', zh: '', en: '', cn: '' };
  }
  function parseWords(txt) {
    var out = [], seen = {};
    String(txt || '').split(/[\n,，、;；\t]+/).forEach(function (x) {
      x = x.trim().replace(/[^A-Za-z' -]/g, '').trim();
      if (!x) return;
      x.split(/\s+/).forEach(function (w) {
        var k = norm(w);
        if (w && !seen[k]) { seen[k] = 1; out.push(w); }
      });
    });
    return out;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- 关卡定义 ---------- */
  function stepsFor(it) {
    var st = ['hear', 'spell'];                 // 必有
    if (it.syl && it.syl.indexOf('·') > 0) st.push('syl');   // 有音节数据才出
    st.push('write');
    return st;
  }

  /* ---------- 反馈 ---------- */
  function say(kind, main, sub, ms) {
    var fb = $('#fb');
    fb.className = 'fb on ' + kind;
    fb.innerHTML = '';
    fb.appendChild(el('span', '', main));
    if (sub) fb.appendChild(el('span', 'sub', sub));
    clearTimeout(say._t);
    if (ms) say._t = setTimeout(function () { fb.className = 'fb'; }, ms);
  }
  function clearSay() { $('#fb').className = 'fb'; }

  function confetti(n) {
    var box = $('#confetti');
    var colors = ['#f0a92e', '#2f6df6', '#1f9d55', '#e0534b', '#8b5cf6', '#f472b6'];
    for (var i = 0; i < n; i++) {
      var p = el('i');
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.top = '-20px';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.4 + Math.random() * 1.1) + 's';
      p.style.animationDelay = (Math.random() * .35) + 's';
      box.appendChild(p);
      (function (node) { setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 3000); })(p);
    }
  }

  /* 攒星：连对越多越亮 */
  function addStar() {
    S.stars++; S.total++;
    if (S.stars > MAX_STARS) S.stars = MAX_STARS;
    renderStars();
  }
  function renderStars() {
    var box = $('#stars');
    box.innerHTML = '';
    for (var i = 0; i < MAX_STARS; i++) {
      var s = el('span', 's' + (i < S.stars ? ' on' : ''), '★');
      box.appendChild(s);
    }
    $('#starNum').textContent = S.total;
  }

  /* ---------- 渲染 ---------- */
  function renderSteps() {
    var box = $('#steps');
    box.innerHTML = '';
    S.steps.forEach(function (_, k) {
      box.appendChild(el('i', k === S.step ? 'on' : (k < S.step ? 'past' : '')));
    });
  }
  function renderProgress() {
    var n = S.queue.length;
    var done = S.i + (S.step / S.steps.length);
    var pct = n ? Math.min(100, Math.round(done / n * 100)) : 0;
    var f = $('#fill');
    f.style.width = pct + '%';
    f.className = 'fill' + (S.i >= n ? ' done' : '');
    $('#pnum').textContent = Math.min(S.i + 1, n) + ' / ' + n;
  }
  function render() {
    if (S.i >= S.queue.length) return renderDone();
    var it = S.queue[S.i];
    S.steps = stepsFor(it);
    if (S.step >= S.steps.length) { S.i++; S.step = 0; return render(); }
    renderSteps(); renderProgress();
    var st = S.steps[S.step];
    $('#stage').innerHTML = '';
    if (st === 'hear') renderHear(it);
    else if (st === 'spell') renderSpell(it);
    else if (st === 'syl') renderSyl(it);
    else renderWrite(it);
  }

  /* ① 听词 → 选中文 */
  function renderHear(it) {
    var q = el('div', 'q');
    q.appendChild(el('div', 'ask', '听一听，选出它的意思'));
    q.appendChild(speakBtn(it.w));

    var opts = el('div', 'opts');
    var others = S.queue.filter(function (x) { return x.w !== it.w && x.zh; });
    var pick = shuffle(others).slice(0, 2);
    if (pick.length < 2) {   // 词太少时从词典凑
      var pool = [];
      if (window.ENZH) {
        var ks = Object.keys(window.ENZH);
        for (var i = 0; i < ks.length && pool.length < 2; i++) {
          var g = ks[Math.floor(Math.random() * ks.length)];
          if (g !== it.w && window.ENZH[g][2] && (!it.zh || window.ENZH[g][2] !== it.zh)) pool.push(window.ENZH[g][2]);
        }
      }
      pick = pick.map(function (x) { return { zh: x.zh }; }).concat(pool.map(function (z) { return { zh: z }; }));
      pick = pick.slice(0, 2);
    }
    var choices = shuffle([{ zh: it.zh || it.w, ok: 1 }].concat(pick.map(function (x) { return { zh: x.zh, ok: 0 }; })));
    choices.forEach(function (c) {
      var b = el('button', 'opt', c.zh);
      b.addEventListener('click', function () {
        if (S.locked || b.disabled) return;
        if (c.ok) { b.classList.add('right'); good('对了！', it); }
        else { b.classList.add('wrong'); b.disabled = true; sfx('nudge'); say('bad', '再听听看～', '点喇叭可以重放', 1800); }
      });
      opts.appendChild(b);
    });
    q.appendChild(opts);
    $('#stage').appendChild(q);

    // 自动读一遍（只在进入这一关时触发一次）
    clearTimeout(renderHear._t);
    renderHear._t = setTimeout(function () {
      var b = $('.q .speak'); if (b) speak(it.w, 0.85, b);
    }, 320);
  }

  /* ② 拼单词：打乱字母 → 点成正确顺序 */
  function renderSpell(it) {
    var word = it.w.toLowerCase();
    var q = el('div', 'q');
    q.appendChild(el('div', 'ask', '把字母排成单词'));
    if (it.zh) q.appendChild(el('div', 'zhbig', it.zh));
    q.appendChild(speakBtn(it.w, true));

    var slots = el('div', 'slots');
    var pool = el('div', 'pool');
    var picked = [];

    // 字母池：拆成单字母；重复字母要分别可点
    var letters = word.split('').map(function (ch, idx) { return { ch: ch, id: idx }; });
    var shuffled = shuffle(letters);
    if (shuffled.length > 1 && shuffled.map(function (x) { return x.ch; }).join('') === word) {
      shuffled = shuffled.slice(1).concat(shuffled.slice(0, 1));   // 万一打乱后还是原序
    }

    var chips = {};
    shuffled.forEach(function (L) {
      var c = el('button', 'chunk', L.ch);
      c.addEventListener('click', function () {
        if (S.locked || c.classList.contains('used')) return;
        c.classList.add('used');
        picked.push(L);
        sfx('tap');
        drawPicked();
      });
      chips[L.id] = c;
      pool.appendChild(c);
    });

    function drawPicked() {
      slots.innerHTML = '';
      slots.className = 'slots' + (picked.length ? ' filled' : '');
      picked.forEach(function (L, k) {
        var s = el('span', 'slot', L.ch);
        s.title = '点一下退回去';
        s.style.cursor = 'pointer';
        s.addEventListener('click', function () {
          if (S.locked) return;
          picked.splice(k, 1);
          var c = chips[L.id];
          if (c) c.classList.remove('used');
          sfx('tap'); drawPicked();
        });
        slots.appendChild(s);
      });
      for (var i = picked.length; i < letters.length; i++) slots.appendChild(el('span', 'slot', ' '));
    }

    // 点满自动判定
    var origDraw = drawPicked;
    drawPicked = function () {
      origDraw();
      if (picked.length === letters.length) {
        var got = picked.map(function (L) { return L.ch; }).join('');
        if (got === word) {
          slots.classList.add('filled');
          speak(it.w, 0.8);
          good('拼对了！', it);
        } else {
          slots.classList.add('wrong');
          sfx('nudge');
          say('bad', '差一点点', '看看是不是有字母站错位置了', 2000);
          // 不自动清空 —— 让孩子自己退格改
        }
      }
    };
    drawPicked();

    var row = el('div', 'btnrow');
    var undo = el('button', 'btn', '↩ 退一格');
    undo.addEventListener('click', function () {
      if (S.locked || !picked.length) return;
      var L = picked.pop();
      var c = chips[L.id]; if (c) c.classList.remove('used');
      sfx('tap'); slots.classList.remove('wrong'); drawPicked();
    });
    row.appendChild(undo);
    q.appendChild(row);
    q.appendChild(slots);
    q.appendChild(pool);
    $('#stage').appendChild(q);
  }

  /* ③ 排音节：听音节 → 排顺序（有音节数据才出） */
  function renderSyl(it) {
    var syls = it.syl.split('·').filter(Boolean);
    var q = el('div', 'q');
    q.appendChild(el('div', 'ask', '听一听，把音节排成单词'));
    if (it.zh) q.appendChild(el('div', 'zhbig', it.zh));

    var whole = speakBtn(it.w, true, 0.7);
    q.appendChild(whole);

    var slots = el('div', 'slots');
    var pool = el('div', 'pool');
    var picked = [];

    syls.forEach(function (s, idx) {
      var b = el('button', 'chunk syl', s);
      b.title = '点一下听这个音节';
      var pickedFlag = false;
      b.addEventListener('click', function () {
        if (S.locked) return;
        if (!pickedFlag) {
          pickedFlag = true; b.classList.add('used');
          picked.push({ s: s, i: idx }); sfx('tap'); drawPicked();
        }
      });
      // 长按（或双击）听单个音节：单独给个小喇叭，避免和「选中」冲突
      var ear = el('button', 'speak small', '🔊');
      ear.style.cssText = 'width:32px;height:32px;font-size:14px;margin-left:6px';
      ear.title = '听 ' + s;
      ear.addEventListener('click', function (e) { e.stopPropagation(); speak(s, 0.7); });
      var wrap = el('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:4px';
      wrap.appendChild(b); wrap.appendChild(ear);
      pool.appendChild(wrap);
      b._id = idx;
    });

    function drawPicked() {
      slots.innerHTML = '';
      slots.className = 'slots' + (picked.length ? ' filled' : '');
      picked.forEach(function (p, k) {
        var s = el('span', 'slot', p.s);
        s.style.cursor = 'pointer';
        s.addEventListener('click', function () {
          if (S.locked) return;
          picked.splice(k, 1);
          var host = pool.children[p.i];
          if (host) host.querySelector('.chunk').classList.remove('used');
          sfx('tap'); drawPicked();
        });
        slots.appendChild(s);
      });
      for (var i = picked.length; i < syls.length; i++) slots.appendChild(el('span', 'slot', ' '));
    }
    drawPicked();

    // 每次选中后自动判定
    var check = function () {
      if (picked.length !== syls.length) return;
      if (picked.map(function (p) { return p.s; }).join('·') === syls.join('·')) {
        speak(it.w, 0.75);
        good('音节排对了！', it, it.w + ' = ' + syls.join(' · '));
      } else {
        sfx('nudge');
        say('bad', '顺序还不对', '点每个小块上的小喇叭再听一次', 2200);
      }
    };
    // 包一层：drawPicked 后判定
    var _d = drawPicked;
    drawPicked = function () { _d(); check(); };

    // 重新绑定（因为上面换了函数引用）
    pool.querySelectorAll('.chunk').forEach(function (b) { });
    // 把选中逻辑挂到新的 drawPicked 上
    (function () {
      var n = pool.children.length;
      for (var i = 0; i < n; i++) {
        (function (host, idx) {
          var b = host.querySelector('.chunk');
          var ear = host.querySelector('.speak');
          var fresh = b.cloneNode(true);
          b.parentNode.replaceChild(fresh, b);
          fresh.addEventListener('click', function () {
            if (S.locked) return;
            if (fresh.classList.contains('used')) return;
            fresh.classList.add('used');
            picked.push({ s: syls[idx], i: idx }); sfx('tap'); drawPicked();
          });
          ear.addEventListener('click', function (e) { e.stopPropagation(); speak(syls[idx], 0.7); });
        })(pool.children[i], i);
      }
    })();
    drawPicked();

    q.appendChild(slots);
    q.appendChild(pool);
    $('#stage').appendChild(q);
  }

  /* ④ 看中文 → 写单词（四线三格，屏幕上点/写） */
  function renderWrite(it) {
    var q = el('div', 'q');
    q.appendChild(el('div', 'ask', '看着意思，把单词写出来'));
    q.appendChild(el('div', 'zhbig', it.zh || it.w));
    q.appendChild(speakBtn(it.w, true));

    var target = it.w.toLowerCase();
    // 答案放这里：点「看答案」后才填进去（先空着，不然泄题）
    var box = el('div', 'lines');
    q.appendChild(box);

    // 真·输入：每个字母一个格子，逐格判断对错
    var wrap = el('div', 'typewrap');
    var input = el('input', 'typein');
    input.type = 'text';
    input.inputMode = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', '在这里输入单词');
    input.maxLength = target.length + 4;

    var labels = el('div', 'typelabels');
    var cells = [];
    for (var ci = 0; ci < target.length; ci++) {
      var c = el('span', 'tcell');
      cells.push(c);
      labels.appendChild(c);
    }
    wrap.appendChild(input);
    wrap.appendChild(labels);

    var autoTimer = null;
    function paint(auto) {
      var v = norm(input.value);
      cells.forEach(function (c, k) {
        var ch = v[k] || '';
        c.textContent = ch;
        c.className = 'tcell' + (!ch ? '' : (ch === target[k] ? ' ok' : ' no'));
        if (k === v.length - 1 && ch) c.classList.add('cur');
      });
      clearTimeout(autoTimer);
      if (!auto) return;
      if (v.length < target.length) return;
      if (v === target) {
        autoTimer = setTimeout(function () { if (!S.locked) good('写对了！', it); }, 420);
      } else {
        autoTimer = setTimeout(function () {
          if (S.locked) return;
          sfx('nudge');
          say('bad', '再想想', '红色的字母位置不对，点小喇叭听一遍', 2200);
        }, 420);
      }
    }
    input.addEventListener('input', function () {
      if (S.locked) return;
      var v = input.value.replace(/[^A-Za-z]/g, '');
      if (v !== input.value) input.value = v;
      paint(true);
    });

    var row = el('div', 'btnrow');
    var bShow = el('button', 'btn', '看答案');
    var bOk = el('button', 'btn primary', '检查 ✓');
    var answered = false;

    bShow.addEventListener('click', function () {
      if (answered) return;
      answered = true;
      box.innerHTML = '';
      box.appendChild(fourLines(it.w, 30));
      bShow.disabled = true;
      bOk.textContent = '记住了 ✓';
      input.blur();
      // 答案同时填进格子：让孩子把「四线三格上的字」和「格子里的字母」对上
      input.value = it.w;
      paint(false);
      say('bad', '没关系，多看两遍', it.w + (it.ipa ? '  /' + it.ipa + '/' : ''), 0);
    });

    // 手动点「检查」
    bOk.addEventListener('click', function () {
      if (answered) {                       // 看过答案 → 算需要再练
        S.miss.push(it.w); addWrong(it.w);
        return good('记住了就好！', it);
      }
      var got = norm(input.value);
      if (!got) { sfx('nudge'); say('bad', '先写点东西吧', '点上面的格子就能打字', 1600); return; }
      if (got === norm(it.w)) return good('写对了！', it);
      sfx('nudge');
      say('bad', '再想想', '差 ' + Math.abs(got.length - it.w.length) + ' 个字母？先点小喇叭听一遍', 2200);
    });

    row.appendChild(bShow); row.appendChild(bOk);
    q.appendChild(wrap);
    q.appendChild(row);
    q.appendChild(el('p', 'tip', '答对会自己跳到下一个词'));
    $('#stage').appendChild(q);
    setTimeout(function () { try { input.focus(); } catch (e) { } }, 420);
  }

  /* 四线三格（跟 words/ 里同一套比例，字号反推线距） */
  function fourLines(word, fs) {
    var NS = 'http://www.w3.org/2000/svg';
    var XR = 0.460;
    fs = fs || 34;
    var W = 100, sp = fs * XR, top = sp * 0.75, H = top + 3 * sp + sp * 0.4;
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var st = [
      { w: 1.2, c: '#8ea4bc', dash: '' },
      { w: 0.6, c: '#cbd6e2', dash: '' },
      { w: 0.7, c: '#e0a458', dash: '3.4 2.6' },
      { w: 1.2, c: '#8ea4bc', dash: '' }
    ];
    st.forEach(function (k, i) {
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', 2); l.setAttribute('x2', W - 2);
      var y = top + i * sp;
      l.setAttribute('y1', y); l.setAttribute('y2', y);
      l.setAttribute('stroke', k.c); l.setAttribute('stroke-width', k.w);
      if (k.dash) l.setAttribute('stroke-dasharray', k.dash);
      s.appendChild(l);
    });
    if (word) {
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', W / 2);
      t.setAttribute('y', top + 2 * sp);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', fs.toFixed(2));
      t.setAttribute('font-family', '"Times New Roman",Times,Georgia,serif');
      t.setAttribute('fill', '#1c1c1c');
      t.textContent = word;
      s.appendChild(t);
    }
    return s;
  }

  /* ---------- 答对统一入口 ---------- */
  function good(msg, it, sub) {
    if (S.locked) return;
    S.locked = true;
    clearTimeout(S._t);
    sfx(S.stars >= 2 ? 'cheer' : 'ok');
    addStar();
    if (S.stars >= 3) confetti(18);
    say('ok', msg + '  ⭐', sub || '', 700);
    // 答对后立刻把整块输入锁死，避免「答对了但还能乱点」的空窗
    document.querySelectorAll('.opt,.chunk,.btn').forEach(function (b) { b.disabled = true; });
    S._t = setTimeout(function () {
      S.locked = false;
      S.step++;
      if (S.step >= S.steps.length) { S.step = 0; S.i++; S.solved++; }
      render();
    }, 700);
  }

  /* ---------- 结算 ---------- */
  function renderDone() {
    renderProgress();
    $('#steps').innerHTML = '';
    var st = $('#stage');
    st.innerHTML = '';
    var d = el('div', 'done');
    d.appendChild(el('div', 'trophy', S.miss.length ? '🎈' : '🏆'));
    d.appendChild(el('h2', '', S.miss.length ? '这一轮练完啦！' : '全对！太厉害了！'));
    d.appendChild(el('div', 'stat', '一共拿到 ' + S.total + ' 颗星 · 一次过关 ' + S.solved + ' 个词'
      + (S.miss.length ? ' · 要再练 ' + S.miss.length + ' 个' : '')));

    if (S.miss.length) {
      d.appendChild(el('div', 'stat', '这些词再练一遍就记住了：'));
      var cs = el('div', 'cards');
      S.miss.forEach(function (w) {
        var it = lookup(w);
        var c = el('div', 'wc miss');
        c.appendChild(el('div', 'en', w));
        if (it.zh) c.appendChild(el('div', 'zh', it.zh));
        cs.appendChild(c);
      });
      d.appendChild(cs);
    } else if (S.queue.length) {
      var cs2 = el('div', 'cards');
      S.queue.slice(0, 8).forEach(function (it) {
        var c = el('div', 'wc');
        c.appendChild(el('div', 'en', it.w));
        if (it.zh) c.appendChild(el('div', 'zh', it.zh));
        cs2.appendChild(c);
      });
      d.appendChild(cs2);
    }

    var row = el('div', 'btnrow');
    if (S.miss.length) {
      var b1 = el('button', 'btn primary', '再练这些 ' + S.miss.length + ' 个');
      b1.addEventListener('click', function () { start(S.miss.map(lookup)); });
      row.appendChild(b1);
    }
    var b2 = el('button', 'btn', S.miss.length ? '重头再来' : '再来一轮');
    b2.addEventListener('click', function () { start(S.queue); });
    row.appendChild(b2);
    var b3 = el('button', 'btn', '换词表');
    b3.addEventListener('click', function () { showSetup(); });
    row.appendChild(b3);
    d.appendChild(row);
    st.appendChild(d);
    sfx('cheer'); confetti(60);
  }

  /* ---------- 设置页 ---------- */
  function showSetup() {
    $('#setup').hidden = false;
    $('#stage').hidden = true;
    $('#steps').hidden = true;
    $('#progwrap').style.visibility = 'hidden';
    var ta = $('#words');
    if (!ta.value) { try { ta.value = localStorage.getItem('words_last') || ''; } catch (e) { } }
    if (!ta.value && window.UNIT1) ta.value = Object.keys(window.UNIT1).join('\n');
    updateCount();
  }
  function hideSetup() {
    $('#setup').hidden = true;
    $('#stage').hidden = false;
    $('#steps').hidden = false;
    $('#progwrap').style.visibility = 'visible';
  }
  function updateCount() {
    var ws = parseWords($('#words').value);
    var withSyl = ws.filter(function (w) { return lookup(w).syl; }).length;
    $('#wcount').textContent = ws.length
      ? ('共 ' + ws.length + ' 个词，其中 ' + withSyl + ' 个有音节数据（有音节才会出「排音节」关）')
      : '一行一个词，或直接粘整段（逗号/空格都能认）';
  }

  /* ---------- 启动 ---------- */
  function start(list) {
    S.queue = list.filter(function (x) { return x && x.w; });
    if (!S.queue.length) { alert('还没有词，先填词表吧'); return showSetup(); }
    S.i = 0; S.step = 0; S.stars = 0; S.total = 0; S.miss = []; S.solved = 0; S.locked = false;
    hideSetup();
    $('#stage').innerHTML = '';
    render();
  }

  function boot() {
    $('#setup').hidden = true;

    $('#btnSetup').addEventListener('click', showSetup);
    $('#btnStart').addEventListener('click', function () {
      var ws = parseWords($('#words').value);
      try { localStorage.setItem('words_last', $('#words').value); } catch (e) { }
      if (!ws.length) { alert('先填几个词吧'); return; }
      var n = parseInt($('#num').value, 10) || 10;
      start(shuffle(ws).slice(0, n).map(lookup));
    });
    $('#words').addEventListener('input', updateCount);
    $('#num').addEventListener('change', updateCount);
    $('#btnShuffle').addEventListener('click', function () {
      var ws = parseWords($('#words').value);
      $('#words').value = shuffle(ws).join('\n');
      updateCount();
    });
    $('#btnBack').addEventListener('click', function () {
      if ($('#setup').hidden === false) return hideSetup();
      if (confirm('退出这一轮？进度不会保存')) start(S.queue);
    });
    $('#btnHome').addEventListener('click', function () { location.href = '../index.html'; });

    renderStars();
    showSetup();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
