Nehan.InlineContext = (function(){
  /**
     @memberof Nehan
     @class InlineContext
     @classdesc context data of inline level.
     @constructor
     @param max_measure {int} - maximum posistion of inline in px.
  */
  function InlineContext(max_measure){
    this.charCount = 0;
    this.curMeasure = 0;
    this.maxMeasure = max_measure; // const
    this.maxExtent = 0;
    this.maxFontSize = 0;
    this.elements = [];
    this.lineBreak = false; // is line-break included in line?
    this.lineOver = false; // is line full-filled?
    this.hyphenated = false; // is line hyphenated?
  }

  /**
   @memberof Nehan.InlineContext
   @return {boolean}
   */
  InlineContext.prototype.isEmpty = function(){
    return !this.lineBreak && this.elements.length === 0;
  };
  /**
   @memberof Nehan.InlineContext
   @return {boolean}
   */
  InlineContext.prototype.isHyphenated = function(){
    return this.hyphenated;
  };
  /**
   @memberof Nehan.InlineContext
   @return {boolean}
   */
  InlineContext.prototype.isLineOver= function(){
    return this.lineOver;
  };
  /**
   @memberof Nehan.InlineContext
   @return {boolean}
   */
  InlineContext.prototype.hasLineBreak = function(){
    return this.lineBreak;
  };
  /**
   @memberof Nehan.InlineContext
   @param status {boolean}
   */
  InlineContext.prototype.setLineBreak = function(status){
    this.lineBreak = status;
  };
  /**
   @memberof Nehan.InlineContext
   @param status {boolean}
   */
  InlineContext.prototype.setLineOver = function(status){
    this.lineOver = status;
  };
  /**
   @memberof Nehan.InlineContext
   @param status {boolean}
   */
  InlineContext.prototype.setHyphenated = function(status){
    this.hyphenated = status;
  };
  /**
   @memberof Nehan.InlineContext
   @param measure {int}
   */
  InlineContext.prototype.addMeasure = function(measure){
    this.curMeasure += measure;
  };
  /**
   @memberof Nehan.InlineContext
   @param element {Nehan.Box}
   @param measure {int}
   */
  InlineContext.prototype.addTextElement = function(element, measure){
    this.elements.push(element);
    this.curMeasure += measure;
    if(element.getCharCount){
      this.charCount += element.getCharCount();
    }
  };
  /**
   @memberof Nehan.InlineContext
   @param element {Nehan.Box}
   @param measure {int}
   */
  InlineContext.prototype.addBoxElement = function(element, measure){
    this.elements.push(element);
    this.curMeasure += measure;
    this.charCount += (element.charCount || 0);
    if(element.maxExtent){
      this.maxExtent = Math.max(this.maxExtent, element.maxExtent);
    } else {
      this.maxExtent = Math.max(this.maxExtent, element.getLayoutExtent());
    }
    if(element.maxFontSize){
      this.maxFontSize = Math.max(this.maxFontSize, element.maxFontSize);
    }
    if(element.hyphenated){
      this.hyphenated = true;
    }
  };
  /**
   @memberof Nehan.InlineContext
   @return {Nehan.Char | Nehan.Word | Nehan.Tcy}
   */
  InlineContext.prototype.getLastElement = function(){
    return Nehan.List.last(this.elements);
  };
  /**
   get all elements.

   @memberof Nehan.InlineContext
   @return {Array}
   */
  InlineContext.prototype.getElements = function(){
    return this.elements;
  };
  /**
   @memberof Nehan.InlineContext
   @return {int}
   */
  InlineContext.prototype.getCurMeasure = function(){
    return this.curMeasure;
  };
  /**
   @memberof Nehan.InlineContext
   @return {int}
   */
  InlineContext.prototype.getRestMeasure = function(){
    return this.maxMeasure - this.curMeasure;
  };
  /**
   @memberof Nehan.InlineContext
   @return {int}
   */
  InlineContext.prototype.getMaxMeasure = function(){
    return this.maxMeasure;
  };
  /**
   @memberof Nehan.InlineContext
   @return {int}
   */
  InlineContext.prototype.getMaxExtent = function(){
    return this.isEmpty()? 0 : this.maxExtent;
  };
  /**
   @memberof Nehan.InlineContext
   @return {int}
   */
  InlineContext.prototype.getMaxFontSize = function(){
    return this.maxFontSize;
  };
  /**
   @memberof Nehan.InlineContext
   @return {int}
   */
  InlineContext.prototype.getCharCount = function(){
    return this.charCount;
  };
  /**
   @memberof Nehan.InlineContext
   @return {Nehan.Char | Nehan.Word | Nehan.Tcy}
   */
  InlineContext.prototype.popElement = function(){
    return this.elements.pop();
  };
  /**
   @memberof Nehan.InlineContext
   @param {Nehan.Box}
   */
  InlineContext.prototype.resumeLine = function(line){
    this.elements = line.elements;
    this.curMeasure = line.inlineMeasure;
    this.maxFontSize = line.maxFontSize || this.maxFontSize;
    this.maxExtent = line.maxExtent || this.maxExtent;
    this.charCount = line.charCount || this.charCount;
  };
  /**
   hyphenate(by sweep) inline element with next head character, return null if nothing happend, or return new tail char if hyphenated.

   @memberof Nehan.InlineContext
   @param head {Nehan.Char} - head_char at next line.
   @return {Nehan.Char | null}
   */
  InlineContext.prototype.hyphenateSweep = function(head){
    var last = this.elements.length - 1;
    var ptr = last;
    var tail = this.elements[ptr] || null;
    var is_tail_ng = function(tail){
      return (tail && tail.isTailNg && tail.isTailNg())? true : false;
    };
    var is_head_ng = function(head){
      return (head && head.isHeadNg && head.isHeadNg())? true : false;
    };

    if(!is_tail_ng(tail) && !is_head_ng(head)){
      return null;
    }

    //console.log("start hyphenate:tail:%o(tail NG:%o), head:%o(head NG:%o)", tail, is_tail_ng(tail), head, is_head_ng(head));

    // if [word] is divided into [word1], [word2], then
    //    [char][word]<br>[char(head_ng)]
    // => [char][word1]<br>[word2][char(head_ng)]
    // so nothing to hyphenate.
    if(tail && tail instanceof Nehan.Word && tail.isDivided()){
      return null;
    }

    while(ptr >= 0){
      tail = this.elements[ptr];
      if(is_head_ng(head) || is_tail_ng(tail)){
	head = tail;
	ptr--;
      } else {
	break;
      }
    }
    if(ptr < 0){
      return tail;
    }
    // if ptr moved, hyphenation is executed.
    if(0 <= ptr && ptr < last){
      // disable text after new tail pos.
      this.elements = this.elements.filter(function(element){
	return element.pos? (element.pos < head.pos) : true;
      });
      return head; // return new head
    }
    return null; // hyphenate failed or not required.
  };
  
  return InlineContext;
})();

