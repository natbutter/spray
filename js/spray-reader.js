var SprayReader = function(containerSelector){ 
  this.container = $('#spray_container');
  this.sprayResultElement = $(containerSelector);
  this.wordCounterElement = $('#word_counter');
  this.highlighter = $('#input-text-highlighter');
  this.inputTextElement = $('#input-text');
  this.fontSize = 3; 
  this.guideElements = $('#guide_top, #guide_bottom, #notch');
  this.speechSynthesis = window.speechSynthesis;
  this.isAudioEnabled = false;
  this.activeHighlightSpan = null;

  // Sync scroll and dimensions from textarea to highlighter
  var self = this;
  this.inputTextElement.on('scroll', function() {
    self.highlighter.scrollTop($(this).scrollTop());
  });
  $(window).on('resize', function() {
    self.syncHighlighterDimensions();
  });
  if (typeof ResizeObserver === 'function' && this.inputTextElement[0]) {
    this.resizeObserver = new ResizeObserver(function() {
      self.syncHighlighterDimensions();
    });
    this.resizeObserver.observe(this.inputTextElement[0]);
  }
  this.syncHighlighterDimensions();
};
SprayReader.prototype = {
  wpm: null,
  msPerWord: null,
  wordIdx: null,
  input: null,
  words: null,
  totalWordCount: 0,
  isRunning: false,
  isPaused: false,
  timers: [],
  selectedVoice: null,

  setInput: function(input) {
    this.input = input;

    var re = /\S+/g;
    var match;
    var allWords = [];
    while(match = re.exec(input)) {
        allWords.push({
            word: match[0],
            start: match.index,
            end: match.index + match[0].length
        });
    }

    this.rawWords = allWords;
    this.renderHighlighter();

    // Preprocess words
    var tmpWords = [];

    for (var i=0; i<allWords.length; i++){
      var wordObj = allWords[i];
      var word = wordObj.word;

      var processedWordObj = {
          word: word,
          start: wordObj.start,
          end: wordObj.end,
          rawObj: wordObj
      };

      if(word.indexOf('.') != -1){
        processedWordObj.word = word.replace('.', '•');
      }
      tmpWords.push(processedWordObj);

      // Double up on long words and words with commas.
      if((word.indexOf(',') != -1 || word.indexOf(':') != -1 || word.indexOf('-') != -1 || word.indexOf('(') != -1|| word.length > 8) && word.indexOf('.') == -1){
        tmpWords.push(processedWordObj);
        tmpWords.push(processedWordObj);
      }

      // Add an additional space after punctuation.
      if(word.indexOf('.') != -1 || word.indexOf('!') != -1 || word.indexOf('?') != -1 || word.indexOf(':') != -1 || word.indexOf(';') != -1|| word.indexOf(')') != -1){
        var pauseObj = { word: '.', start: -1, end: -1 };
        tmpWords.push(pauseObj);
        tmpWords.push(pauseObj);
        tmpWords.push(pauseObj);
      }
    }

    this.displayWords = tmpWords;
    this.words = this.isAudioEnabled ? this.rawWords : this.displayWords;
    this.totalWordCount = this.words.length;
    this.wordIdx = 0;
    this.wordCounterElement.text("0 / " + this.totalWordCount);
  },

  setWpm: function(wpm) {
    this.wpm = parseInt(wpm, 10);
    this.msPerWord = 60000/wpm;
  },

  setVoice: function(voiceURI) {
    if (!this.speechSynthesis) return;
    var voices = this.speechSynthesis.getVoices();
    this.selectedVoice = voices.find(function(v) { return v.voiceURI === voiceURI; }) || null;
  },

  start: function() {
    this.isRunning = true;
    this.isPaused = false;

    // If there are any uncleared timers, clear them.
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = []; // Reset timers array

    if (this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel(); // Stop any ongoing speech
    }

    if (this.highlighter && this.highlighter.length > 0 && this.highlighter[0].childNodes.length === 0 && this.input) {
      this.renderHighlighter();
    }

    // Update words list based on current audio setting
    var prevWordIdx = this.wordIdx;
    var oldWords = this.words;
    
    this.words = this.isAudioEnabled ? this.rawWords : this.displayWords;
    
    if (this.words) {
      this.totalWordCount = this.words.length;
      
      // If switching modes, map the current word index to the new list
      if (oldWords && oldWords !== this.words && oldWords.length > 0 && prevWordIdx < oldWords.length) {
        var currentWordObj = oldWords[prevWordIdx];
        var targetStart = currentWordObj.start;
        if (targetStart === -1) {
          for (var j = prevWordIdx - 1; j >= 0; j--) {
            if (oldWords[j].start !== -1) {
              targetStart = oldWords[j].start;
              break;
            }
          }
        }
        var newIdx = 0;
        if (targetStart !== -1) {
          for (var i = 0; i < this.words.length; i++) {
            if (this.words[i].start >= targetStart) {
              newIdx = i;
              break;
            }
          }
        }
        this.wordIdx = newIdx;
      }
    }

    if (this.words && this.words.length > 0) {
      if (this.isAudioEnabled && this.speechSynthesis) {
        this.startAudio();
      } else {
        this.displayWordAndIncrement(); // Start the visual-only display process
      }
    }
  },

  stop: function() {
    this.isRunning = false;
    this.isPaused = false;
    this.wordIdx = 0;

    // Clear all main timers
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = []; // Reset the timers array

    // Stop any ongoing speech
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
    if (this.wordCounterElement) {
        this.wordCounterElement.text("0 / " + this.totalWordCount);
    }
    this.activeHighlightSpan = null;
    this.highlighter.html('');
  },

  pause: function() {
    this.isRunning = false;
    this.isPaused = true;

    // Clear all main timers
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = []; // Reset the timers array

    // Stop any ongoing speech
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
  },

  startAudio: function() {
    if (!this.speechSynthesis) return;

    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }

    if (this.wordIdx >= this.words.length) {
      this.stop();
      return;
    }

    var startCharIdx = this.words[this.wordIdx].start;
    var textToSpeak = this.input.substring(startCharIdx);

    var utterance = new SpeechSynthesisUtterance(textToSpeak);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    
    // WPM conversion: typical speaking speed is ~150 WPM (rate = 1.0)
    var rate = this.wpm / 150;
    utterance.rate = Math.max(0.5, Math.min(rate, 3.0));

    var thisObj = this;
    this.audioStartCharIdx = startCharIdx;

    utterance.onboundary = function(event) {
      if (!thisObj.isRunning) return;

      if (event.name === 'word') {
        var absoluteCharIdx = thisObj.audioStartCharIdx + event.charIndex;
        
        // Find the closest word in this.words that starts at or before the boundary index
        var matchedIdx = 0;
        for (var i = 0; i < thisObj.words.length; i++) {
          if (thisObj.words[i].start <= absoluteCharIdx) {
            matchedIdx = i;
          } else {
            break;
          }
        }
        thisObj.wordIdx = matchedIdx;
        thisObj.displayWord();
      }
    };

    utterance.onend = function() {
      if (thisObj.isRunning) {
        thisObj.stop();
      }
    };

    utterance.onerror = function(event) {
      console.error("Speech synthesis error:", event.error);
      // Fallback to visual-only if audio fails
      if (thisObj.isRunning) {
        thisObj.isAudioEnabled = false;
        thisObj.words = thisObj.displayWords;
        thisObj.totalWordCount = thisObj.words.length;
        thisObj.start();
      }
    };

    this.speechSynthesis.speak(utterance);
    this.displayWord();
  },

  displayWord: function() {
    if (!this.words || this.wordIdx >= this.words.length) {
      return;
    }

    this.wordCounterElement.text((this.wordIdx + 1) + " / " + this.totalWordCount);

    var currentWordObj = this.words[this.wordIdx];
    this.highlightWord(currentWordObj);
    var currentWord = currentWordObj.word;
    var pivotedWord = pivot(currentWord);
    this.sprayResultElement.html(pivotedWord);
  },

  displayWordAndIncrement: function() {
    if (!this.isRunning || !this.words || this.wordIdx >= this.words.length) {
      this.stop();
      return;
    }

    this.displayWord();

    // Clear any existing timers before scheduling the next one
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = [];

    var thisObj = this;
    var scheduleNextWord = function(delay) {
      if (thisObj.isRunning) {
        var timerId = setTimeout(function() {
          thisObj.displayWordAndIncrement();
        }, delay);
        thisObj.timers.push(timerId);
      }
    };

    this.wordIdx++;
    scheduleNextWord(this.msPerWord);
  },

  increaseFontSize: function() {
    if (this.fontSize < 10) { // Prevent font size from becoming too large
      this.fontSize += 0.5; 
      this.sprayResultElement.css('font-size', `clamp(16px, ${this.fontSize}vw, 96px)`);
    }
  },

  decreaseFontSize: function() {
    if (this.fontSize > 1) { 
      this.fontSize -= 0.5; 
      this.sprayResultElement.css('font-size', `clamp(16px, ${this.fontSize}vw, 96px)`);
    }
  },

  syncHighlighterDimensions: function() {
    var inputEl = this.inputTextElement && this.inputTextElement[0];
    var highlighterEl = this.highlighter && this.highlighter[0];
    if (!inputEl || !highlighterEl) return;

    if (inputEl.clientWidth > 0 && inputEl.clientHeight > 0 && typeof window.getComputedStyle === 'function') {
      var style = window.getComputedStyle(inputEl);
      var borderLeft = parseFloat(style.borderLeftWidth) || 0;
      var borderRight = parseFloat(style.borderRightWidth) || 0;
      var borderTop = parseFloat(style.borderTopWidth) || 0;
      var borderBottom = parseFloat(style.borderBottomWidth) || 0;

      // Match highlighter content+padding box to textarea client dimensions to prevent scrollbar width drift
      highlighterEl.style.width = (inputEl.clientWidth + borderLeft + borderRight) + 'px';
      highlighterEl.style.height = (inputEl.clientHeight + borderTop + borderBottom) + 'px';
    }
  },

  renderHighlighter: function() {
    this.activeHighlightSpan = null;
    if (!this.highlighter || this.highlighter.length === 0) return;

    var highlighterEl = this.highlighter[0];
    highlighterEl.innerHTML = '';

    var input = this.input || '';
    var words = this.rawWords || [];
    var fragment = document.createDocumentFragment();
    var lastIndex = 0;

    for (var i = 0; i < words.length; i++) {
      var wordObj = words[i];
      if (wordObj.start > lastIndex) {
        fragment.appendChild(document.createTextNode(input.slice(lastIndex, wordObj.start)));
      }
      var span = document.createElement('span');
      span.textContent = input.slice(wordObj.start, wordObj.end);
      wordObj.span = span;
      fragment.appendChild(span);
      lastIndex = wordObj.end;
    }

    if (lastIndex < input.length) {
      fragment.appendChild(document.createTextNode(input.slice(lastIndex)));
    }
    if (input.length > 0 && input.charAt(input.length - 1) === '\n') {
      fragment.appendChild(document.createTextNode(' '));
    }

    highlighterEl.appendChild(fragment);
    this.syncHighlighterDimensions();
    if (this.inputTextElement && this.inputTextElement[0]) {
      highlighterEl.scrollTop = this.inputTextElement[0].scrollTop;
    }
  },

  highlightWord: function(wordObj) {
    var targetSpan = wordObj ? (wordObj.rawObj ? wordObj.rawObj.span : wordObj.span) : null;

    if (this.activeHighlightSpan && this.activeHighlightSpan !== targetSpan) {
      this.activeHighlightSpan.className = '';
      this.activeHighlightSpan = null;
    }

    if (!wordObj || wordObj.start === -1 || !targetSpan) {
      return;
    }

    if (this.activeHighlightSpan !== targetSpan) {
      targetSpan.className = 'highlight';
      this.activeHighlightSpan = targetSpan;
    }

    // Scroll to keep the highlighted word centered and synchronously match highlighter scrollTop
    var inputEl = this.inputTextElement && this.inputTextElement[0];
    var highlighterEl = this.highlighter && this.highlighter[0];
    if (inputEl && highlighterEl) {
      var containerHeight = inputEl.clientHeight;
      var targetScrollTop = targetSpan.offsetTop - (containerHeight / 2) + (targetSpan.offsetHeight / 2);
      var maxScrollTop = Math.max(0, inputEl.scrollHeight - containerHeight);
      targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
      inputEl.scrollTop = targetScrollTop;
      highlighterEl.scrollTop = inputEl.scrollTop;
    }
  }
};

// Find the red-character of the current word.
function pivot(word){ // Removed fontSize parameter
    var length = word.length;

    // Longer words are "right-weighted" for easier readability.
    if(length<6){

        var bit = 1;
        while(word.length < 22){
            if(bit > 0){
                word = word + '.';
            }
            else{
                word = '.' + word;
            }
            bit = bit * -1;
        }

        var start = '';
        var end = '';
        if((length % 2) === 0){
            start = word.slice(0, word.length/2);
            end = word.slice(word.length/2, word.length);
        } else{
            start = word.slice(0, word.length/2);
            end = word.slice(word.length/2, word.length);
        }

        var result;
        // Removed inline style for font-size, they will inherit from parent
        result = "<span class='spray_start'>" + start.slice(0, start.length -1);
        result = result + "</span><span class='spray_pivot'>";
        result = result + start.slice(start.length-1, start.length);
        result = result + "</span><span class='spray_end'>";
        result = result + end;
        result = result + "</span>";
    }

    else{

        var tail = 22 - (word.length + 7);
        word = '.......' + word + ('.'.repeat(tail));

        var start = word.slice(0, word.length/2);
        var end = word.slice(word.length/2, word.length);

        var result;
        // Removed inline style for font-size, they will inherit from parent
        result = "<span class='spray_start'>" + start.slice(0, start.length -1);
        result = result + "</span><span class='spray_pivot'>";
        result = result + start.slice(start.length-1, start.length);
        result = result + "</span><span class='spray_end'>";
        result = result + end;
        result = result + "</span>";

    }

    result = result.replace(/\./g, "<span class='invisible'>.</span>"); // Also for invisible utility class

    return result;
}

// Let strings repeat themselves,
// because JavaScript isn't as awesome as Python.
String.prototype.repeat = function( num ){
    return (num<=0) ? "" : new Array( num + 1 ).join( this );
}
