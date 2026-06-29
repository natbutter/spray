var SprayReader = function(containerSelector){ 
  this.container = $('#spray_container');
  this.sprayResultElement = $(containerSelector);
  this.wordCounterElement = $('#word_counter');
  this.highlighter = $('#input-text-highlighter');
  this.fontSize = 3; 
  this.guideElements = $('#guide_top, #guide_bottom, #notch');
  this.speechSynthesis = window.speechSynthesis;
  this.isAudioEnabled = false;
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

  setInput: function(input) {
    this.input = input;
    this.highlighter.html('');

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

    // Preprocess words
    var tmpWords = [];

    for (var i=0; i<allWords.length; i++){
      var wordObj = allWords[i];
      var word = wordObj.word;

      var processedWordObj = {
          word: word,
          start: wordObj.start,
          end: wordObj.end
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
        var newIdx = 0;
        for (var i = 0; i < this.words.length; i++) {
          if (this.words[i].start >= targetStart) {
            newIdx = i;
            break;
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
    if (this.wordIdx >= this.words.length) {
      this.stop();
    } else {
      scheduleNextWord(this.msPerWord);
    }
  },

  increaseFontSize: function() {
    if (this.fontSize < 10) { // Prevent font size from becoming too large
      this.fontSize += 0.5; 
      this.sprayResultElement.css('font-size', `clamp(16px, ${this.fontSize}vw, 72px)`);
    }
  },

  decreaseFontSize: function() {
    if (this.fontSize > 1) { 
      this.fontSize -= 0.5; 
      this.sprayResultElement.css('font-size', `clamp(16px, ${this.fontSize}vw, 72px)`);
    }
  },

  highlightWord: function(wordObj) {
    if (wordObj.start === -1) {
      this.highlighter.html('');
      return;
    }

    var text = this.input;
    var before = text.substring(0, wordObj.start);
    var word = text.substring(wordObj.start, wordObj.end);
    var after = text.substring(wordObj.end);

    var html = before + '<span class="highlight">' + word + '</span>' + after;
    this.highlighter.html(html);
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
