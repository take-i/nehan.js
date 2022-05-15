/**
 * spacing utility module<br>
 * this module add spacing to char at start/end direction in some contextual condition.

 @namespace Nehan.Spacing
*/
Nehan.Spacing = {
  /**
     @memberof Nehan.Spacing
     @param cur_text {Nehan.Char | Nehan.Word}
     @param prev_text {Nehan.Char | Nehan.Word | Nehan.Tcy}
     @param next_text {Nehan.Char | Nehan.Word | Nehan.Tcy}
  */
  add : function(cur_text, prev_text, next_text){
    if(cur_text instanceof Nehan.Char){
      this._addCharSpacing(cur_text, prev_text, next_text);
    } else if(cur_text instanceof Nehan.Word){
      this._addWordSpacing(cur_text, prev_text, next_text);
    }
  },
  /**
     @memberof Nehan.Spacing
     @param cur_char(zenkaku) {Nehan.Char}
     @param prev_text {Nehan.Char | Nehan.Word | Nehan.Tcy}
     @param next_text {Nehan.Char | Nehan.Word | Nehan.Tcy}
  */
  _addCharSpacing : function(cur_char, prev_text, next_text){
    if(cur_char.isKakkoStart()){
      this._setSpacingStart(cur_char, prev_text);
    } else if(cur_char.isKakkoEnd() || cur_char.isKutenTouten()){
      this._setSpacingEnd(cur_char, next_text);
    }
  },
  _addWordSpacing : function(cur_word, prev_text, next_text){
    if(prev_text && prev_text instanceof Nehan.Char && !prev_text.isSpaceGroup() && (typeof prev_text.spaceRateEnd === "undefined")){
      cur_word.spaceRateStart = 0.25;
    }
    if(next_text && next_text instanceof Nehan.Char && !next_text.isSpaceGroup() && !next_text.isKakkoStart() && !(next_text.isKutenTouten() && next_text.isZenkaku())){
      cur_word.spaceRateEnd = 0.25;
    }
  },
  _setSpacingStart : function(cur_char, prev_text){
    var space_rate = this._getTextSpaceStart(cur_char, prev_text);
    if(space_rate > 0){
      cur_char.spaceRateStart = space_rate;
    }
  },
  _setSpacingEnd : function(cur_char, next_text){
    if(next_text instanceof Nehan.Char && next_text.isTenten()){
      return;
    }
    var space_rate = this._getTextSpaceEnd(cur_char, next_text);
    if(space_rate > 0){
      cur_char.spaceRateEnd = space_rate;
    }
  },
  // if previous text is not exists or previous text is not left brace(or paren etc),
  // add space to start direction.
  //
  // [example:add space]
  //   (  => [SPACE](
  //   a( => a[SPACE](
  //
  // [example:do nothing]
  //   (( => ((
  //   {( => {(
  _getTextSpaceStart : function(cur_char, prev_text){
    if(prev_text === null){
      return 0.5;
    }
    if(prev_text instanceof Nehan.Char && prev_text.isKakkoStart()){
      return 0;
    }
    return 0.5;
  },
  // if next text is not exists or next text is not right brace(or paren etc),
  // add space to end direction.
  //
  // [example:add space]
  //   )  => )[SPACE]
  //   )a => )[SPACE]a
  //
  // [example:do nothing]
  //   )) => ))
  //   )} => )}
  //   ,( => ,(
  _getTextSpaceEnd : function(cur_char, next_text){
    if(next_text === null){
      return 0.5;
    }
    if(next_text instanceof Nehan.Char && (cur_char.isKutenTouten() && next_text.isKakkoStart())){
      return 0;
    }
    if(next_text instanceof Nehan.Char && (next_text.isKakkoEnd() || next_text.isKutenTouten())){
      return 0;
    }
    return 0.5;
  }
};
