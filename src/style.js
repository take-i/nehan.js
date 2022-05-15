Nehan.Style = (function(){
  /**
   @memberof Nehan
   @class Style
   @classdesc abstraction of document tree hierarchy with selector values, associated markup, cursor_context.
   @constructor
   @param context {Nehan.RenderingContext}
   @param markup {Nehan.Tag} - markup of style
   @param paernt {Nehan.Style} - parent style
   @param force_css {Object} - system css that must be applied.
   */
  function Style(context, markup, parent, force_css){
    this._initialize(context, markup, parent, force_css || {});
  }

  Style.prototype._initialize = function(context, markup, parent, force_css){
    this.context = context;
    this.markup = markup;
    this.markupName = markup.getName();
    this.parent = parent || null;

    // notice that 'this.children' is not children of each page.
    // for example, assume that <body> consists 2 page(<div1>, <div2>).
    //
    // <body><div1>page1</div1><div2>page2</div2></body>
    //
    // at this case, global chilren of <body> is <div1> and <div2>.
    // but for '<body> of page1', <div1> is the only child, and <div2> is for '<body> of page2' also.
    this.children = [];

    this.next = null; // next sibling
    this.prev = null; // prev sibling

    // initialize tree
    if(parent){
      parent.appendChild(this);
    }

    // create selector cache key
    this.selectorCacheKey = this._computeSelectorCacheKey();

    this.managedCss = new Nehan.CssHashSet();
    this.unmanagedCss = new Nehan.CssHashSet();
    this.callbackCss = new Nehan.CssHashSet();

    // set preloaded data if exists.
    var res = this.getPreloadResource();
    if(res){
      this._registerPreloadResource(res);
    }

    // load managed css from
    // 1. load selector css.
    // 2. load inline css from 'style' property of markup.
    // 3. call 'onload' callback if exists.
    // 4. load system required css(force_css).
    this._registerCssValues(this._loadSelectorCss(markup, parent));
    this._registerCssValues(this._loadInlineCss(markup));
    var onload = this.callbackCss.get("onload");
    if(onload){
      onload(this._createSelectorContext("onload"));
    }
    this._registerCssValues(force_css); // overwrite css with highest priority.

    // always required properties
    this.display = this._loadDisplay(); // required
    this.flow = this._loadFlow(); // required
    this.boxSizing = this._loadBoxSizing(); // required

    // optional properties
    var color = this._loadColor();
    if(color){
      this.color = color;
    }
    var font = this._loadFont();
    if(font){
      this.font = font;
    }
    var box_position = this._loadBoxPosition();
    if(box_position){
      this.boxPosition = box_position;
    }
    var border_collapse = this._loadBorderCollapse();
    if(border_collapse){
      this.borderCollapse = border_collapse;
    }
    var text_align = this._loadTextAlign();
    if(text_align){
      this.textAlign = text_align;
    }
    var text_empha = this._loadTextEmpha();
    if(text_empha){
      this.textEmpha = text_empha;
    }
    var list_style = this._loadListStyle();
    if(list_style){
      this.listStyle = list_style;
    }
    // keyword 'float' is reserved in js, so we name this prop 'float direction' instead.
    var float_direction = this._loadFloatDirection();
    if(float_direction){
      this.floatDirection = float_direction;
    }
    var break_before = this._loadBreakBefore();
    if(break_before){
      this.breakBefore = break_before;
    }
    var break_after = this._loadBreakAfter();
    if(break_after){
      this.breakAfter = break_after;
    }
    var word_break = this._loadWordBreak();
    if(word_break){
      this.wordBreak = word_break;
    }
    var white_space = this._loadWhiteSpace();
    if(white_space){
      this.whiteSpace = white_space;
    }
    var hanging_punctuation = this._loadHangingPunctuation();
    if(hanging_punctuation){
      this.hangingPunctuation = hanging_punctuation;
    }
    var edge = this._loadEdge(this.flow, this.getFontSize());
    if(edge){
      this.edge = edge;
    }
    // static size is defined in selector or tag attr.
    this.staticMeasure = this._loadStaticMeasure();
    this.staticExtent = this._loadStaticExtent();

    // context size(outer size and content size) is defined by
    // 1. parent content size
    // 2. edge size
    // 3. static size
    this.initContextSize(this.staticMeasure, this.staticExtent);

    // margin-cancel or edge-collapse after context size is calculated.
    if(this.edge){
      if(this.edge.margin){
	Nehan.MarginCancel.cancel(this);
      }
      // border collapse after context size is calculated.
      if(this.edge.border && this.getBorderCollapse() === "collapse" && this.display !== "table"){
	Nehan.BorderCollapse.collapse(this);
      }
    }

    // disable some unmanaged css properties depending on loaded style values.
    this._disableUnmanagedCssProps(this.unmanagedCss);
  };
  /**
   calculate contexual box size of this style.

   @memberof Nehan.Style
   @method initContextSize
   @param measure {int}
   @param extent {int}
   @description <pre>
   *
   * (a) outer_size
   * 1. if direct size is given, use it as outer_size.
   * 2. else if parent exists, use content_size of parent.
   * 3. else if parent not exists(root), use layout size defined in display.js.
   
   * (b) content_size
   * 1. if edge(margin/padding/border) is defined, content_size = parent_content_size - edge_size
   *    1.1. if box-sizing is "margin-box", margin/padding/border are included in width/height, so
   *         content_width  = width  - (margin + padding + border).width
   *         content_height = height - (margin + padding + border).height
   *    1.2  if box-sizing is "border-box", padding/border are included in width/height, so
   *         content_width  = width  - (padding + border).width
   *         content_height = height - (padding + border).height
   *    1.3  if box-sizing is "content-box", edge_size is not included in width/height, so
   *         content_width  = width
   *         content_height = height
   * 2. else(no edge),  content_size = outer_size
   *</pre>
   */
  Style.prototype.initContextSize = function(measure, extent){
    this.initContextMeasure(measure);
    this.initContextExtent(extent);
  };
  /**
   calculate contexual box measure

   @memberof Nehan.Style
   @method initContextMeasure
   @param measure {int}
   */
  Style.prototype.initContextMeasure = function(measure){
    this.measure = measure || this.getParentContentMeasure();
    this.contentMeasure = this._computeContentMeasure(this.measure);
  };
  /**
   calculate contexual box extent

   @memberof Nehan.Style
   @method initContextExtent
   @param extent {int}
   */
  Style.prototype.initContextExtent = function(extent){
    this.extent = extent || this.getParentContentExtent();
    this.contentExtent = this._computeContentExtent(this.extent);
  };
  /**
   update context size, and propagate update to children.

   @memberof Nehan.Style
   @param measure {int}
   @param extent {int}
   */
  Style.prototype.updateContextSize = function(measure, extent){
    // measure of marker or table is always fixed.
    if(this.markupName === "marker" || this.display === "table"){
      return this;
    }
    this.initContextSize(measure, extent);

    // force re-culculate context-size of children based on new context-size of parent.
    Nehan.List.iter(this.children, function(child){
      child.updateContextSize(null, null);
    });

    return this;
  };
  /**
   append child style context

   @memberof Nehan.Style
   @param child_style {Nehan.Style}
   */
  Style.prototype.appendChild = function(child_style){
    if(this.children.length > 0){
      var last_child = Nehan.List.last(this.children);
      last_child.next = child_style;
      child_style.prev = last_child;
    }
    this.children.push(child_style);
  };
  /**
   @memberof Nehan.Style
   @param child_style {Nehan.Style}
   @return {Nehan.Style | null} removed child or null if nothing removed.
   */
  Style.prototype.removeChild = function(child_style){
    var index = Nehan.List.indexOf(this.children, function(child){
      return child === child_style;
    });
    if(index >= 0){
      var removed_child = this.children.splice(index, 1);
      return removed_child;
    }
    return null;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isDisabled = function(){
    if(this.display === "none"){
      return true;
    }
    if(Nehan.List.exists(Nehan.Config.disabledMarkups, Nehan.Closure.eq(this.getMarkupName()))){
      return true;
    }
    if(this.contentMeasure <= 0 || this.contentExtent <= 0){
      return true;
    }
    if(this.parent && this.contentMeasure > this.getRootStyle().contentMeasure){
      console.warn("too large content %o skipped:(measure = %d, root measure = %d)", this, this.contentMeasure, this.getRootStyle().contentMeasure);
      return true;
    }
    if(this.markup.isCloseTag()){
      return true;
    }
    if(!this.markup.isSingleTag() && this.isMarkupEmpty() && this.getContent() === ""){
      return true;
    }
    return false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isBlock = function(){
    switch(this.display){
    case "block":
    case "table":
    case "table-caption":
    case "table-header-group": // <thead>
    case "table-row-group": // <tbody>
    case "table-footer-group": // <tfoot>
    case "table-row":
    case "table-cell":
    case "list-item":
      return true;
    }
    return false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isRoot = function(){
    return this.getMarkupName() === "body";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isInlineBlock = function(){
    return this.display === "inline-block" && this.isFloated() === false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isInline = function(){
    if(this.getMarkupName() === "first-line"){
      return true;
    }
    return this.display === "inline";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isManagedCssProp = function(prop){
    return Nehan.List.exists(Nehan.Config.managedCssProps, Nehan.Closure.eq(prop));
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isCallbackCssProp = function(prop){
    return Nehan.List.exists(Nehan.Config.callbackCssProps, Nehan.Closure.eq(prop));
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isFloatStart = function(){
    return this.floatDirection? this.floatDirection.isStart() : false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isFloatEnd = function(){
    return this.floatDirection? this.floatDirection.isEnd() : false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isFloated = function(){
    return this.isFloatStart() || this.isFloatEnd();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isPushed = function(){
    return this.getMarkupAttr("pushed") !== null;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isTableCell = function(){
    return this.display === "table-cell";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isPulled = function(){
    return this.getMarkupAttr("pulled") !== null;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isLazy = function(){
    return this.getMarkupAttr("lazy") !== null;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isLineBreak = function(){
    return this.markupName === "br";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isTextEmphaEnable = function(){
    return (this.textEmpha && this.textEmpha.isEnable())? true : false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isTextVertical = function(){
    return this.flow.isTextVertical();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isTextHorizontal = function(){
    return this.flow.isTextHorizontal();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isPositionAbsolute = function(){
    return this.boxPosition? this.boxPosition.isAbsolute() : false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isPre = function(){
    return this.whiteSpace === "pre" || this.whiteSpace === "pre-wrap" || this.whiteSpace === "pre-line";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isEmptyAnchor = function(){
    return this.markup && this.markup.isAnchorTag() && this.isMarkupEmpty();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isPageBreak = function(){
    switch(this.getMarkupName()){
    case "page-break": case "end-page":
      return true;
    default:
      return false;
    }
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isBreakBefore = function(){
    return this.breakBefore? !this.breakBefore.isAvoid() : false;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isBreakAfter = function(){
    return this.breakAfter? !this.breakAfter.isAvoid() : false;
  };
  /**
   @memberof Nehan.Style
   @param nth {int}
   @return {boolean}
   */
  Style.prototype.isNthChild = function(nth){
    return this.getChildNth() === nth;
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isFirstChild = function(){
    return this.markup.isFirstChild();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isFirstOfType = function(){
    return this.markup.isFirstOfType();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isLastChild = function(){
    return this.markup.isLastChild();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isLastOfType = function(){
    return this.markup.isLastOfType();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isOnlyChild = function(){
    return this.markup.isOnlyChild();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isOnlyOfType = function(){
    return this.markup.isOnlyOfType();
  };
  /**
   @memberof Nehan.Style
   @description Looks through styles from current to parent, returning the first style that passes a truth test 'predicate', return null if not found.
   @param predicate {Function} - predicate test function, {Nehan.Style} -> {bool}
   @return {Nehan.Style}
   */
  Style.prototype.find = function(predicate){
    if(predicate(this)){
      return this;
    }
    if(this.parent){
      return this.parent.find(predicate);
    }
    return null;
  };
  /**
   @memberof Nehan.Style
   @param args {Array.<Nehan.CompoundSelector>}
   @return {boolean}
   */
  Style.prototype.not = function(args){
    return Nehan.List.forall(args, function(arg){
      return !arg.test(this);
    }.bind(this));
  };
  /**
   @memberof Nehan.Style
   @param args {Array.<Nehan.CompoundSelector>}
   @return {boolean}
   */
  Style.prototype.matches = function(args){
    return Nehan.List.exists(args, function(arg){
      return arg.test(this);
    }.bind(this));
  };
  /**
   @memberof Nehan.Style
   @param args {Array.<String>} - lang name list
   @return {boolean}
   */
  Style.prototype.lang = function(args){
    var lang = this.getMarkupAttr("lang");
    if(!lang){
      return false;
    }
    return Nehan.List.exists(args, Nehan.Closure.eq(lang));
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isMarkupEmpty = function(){
    return this.markup.isEmpty();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isWordBreakAll = function(){
    var word_break = this.getWordBreak();
    return word_break.isWordBreakAll();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isHyphenationEnable = function(){
    var word_break = this.getWordBreak();
    return word_break.isHyphenationEnable();
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isHangingPuncEnable = function(){
    return this.hangingPunctuation && this.hangingPunctuation === "allow-end";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isContentBox = function(){
    return this.boxSizing === "content-box";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isBorderBox = function(){
    return this.boxSizing === "border-box";
  };
  /**
   @memberof Nehan.Style
   @return {boolean}
   */
  Style.prototype.isMarginBox = function(){
    return this.boxSizing === "margin-box";
  };
  /**
   search property from markup attributes first, and css values second.

   @memberof Nehan.Style
   @param name {String}
   @param def_value {default_value}
   @return {value}
   */
  Style.prototype.getAttr = function(name, def_value){
    var ret = this.getMarkupAttr(name);
    if(typeof ret !== "undefined" && ret !== null){
      return ret;
    }
    ret = this.getCssAttr(name);
    if(typeof ret !== "undefined" && ret !== null){
      return ret;
    }
    return (typeof def_value !== "undefined")? def_value : null;
  };
  /**
   @memberof Nehan.Style
   @param name {String}
   @param def_value {default_value}
   @return {value}
   */
  Style.prototype.getMarkupAttr = function(name, def_value){
    // if markup is "<img src='aaa.jpg'>"
    // getMarkupAttr("src") => 'aaa.jpg'
    if(name === "id"){
      return this.markup.id;
    }
    return this.markup.getAttr(name, def_value);
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getPropStaticMeasure = function(){
    switch(this.getMarkupName()){
    case "img": return "width";
    default: return this.flow.getPropMeasure();
    }
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getPropStaticExtent = function(){
    switch(this.getMarkupName()){
    case "img": return "height";
    default: return this.flow.getPropExtent();
    }
  };
  Style.prototype._evalCssAttr = function(prop, value){
    // if value is function, call with selector context, and format the returned value.
    if(typeof value === "function"){
      var context = this._createSelectorContext(prop);
      var entry = Nehan.CssParser.formatEntry(prop, value(context));
      return entry.value;
    }
    if(typeof value === "object"){
      return Nehan.Obj.map(value, function(prop, value){
	return this._evalCssAttr(prop, value);
      }.bind(this));
    }
    return value;
  };
  /**
   @memberof Nehan.Style
   @param name {String}
   @param value {css_value}
   */
  Style.prototype.setCssAttr = function(name, value){
    if(!value){
      console.warn("Style::setCssAttr, invalid value %o for %s", value, name);
    }
    var entry = Nehan.CssParser.formatEntry(name, value);
    var target_css = this.isManagedCssProp(entry.getPropName())? this.managedCss : this.unmanagedCss;
    target_css.add(entry.getPropName(), entry.getValue());
  };
  /**
   @memberof Nehan.Style
   @param name {String}
   @def_value {default_value}
   @return {css_value}
   @description <pre>
   * notice that subdivided properties like 'margin-before' as [name] are always not found,
   * even if you defined them in setStyle(s).
   * because all subdivided properties are already converted into unified name in loading process.
   */
  Style.prototype.getCssAttr = function(name, def_value){
    var ret;
    ret = this.managedCss.get(name);
    if(ret !== null){
      return this._evalCssAttr(name, ret);
    }
    ret = this.unmanagedCss.get(name);
    if(ret !== null){
      return this._evalCssAttr(name, ret);
    }
    ret = this.callbackCss.get(name);
    if(ret !== null){
      return ret;
    }
    return (typeof def_value !== "undefined")? def_value : null;
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getParentMarkupName = function(){
    return this.parent? this.parent.getMarkupName() : null;
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Tag}
   */
  Style.prototype.getMarkup = function(){
    return this.markup;
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getMarkupName = function(){
    return this.markup.getName();
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getMarkupPath = function(){
    return this.markup.getPath();
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getMarkupId = function(){
    return this.markup.getId();
  };
  /**
   @memberof Nehan.Style
   @return {Array.<String>}
   */
  Style.prototype.getMarkupClasses = function(){
    return this.markup.getClasses();
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getMarkupContent = function(){
    return this.markup.getContent();
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getMarkupPos = function(){
    return this.markup.pos;
  };
  /**
   @memberof Nehan.Style
   @param name {String}
   @return {String}
   */
  Style.prototype.getMarkupData = function(name){
    return this.markup.getData(name);
  };
  /**
   @memberof Nehan.Style
   @param name {String}
   @param value {String}
   @return {String}
   */
  Style.prototype.setMarkupAttr = function(name, value){
    return this.markup.setAttr(name, value);
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getContent = function(){
    var content = this.getCssAttr("content") || this.markup.getContent();
    var before = this.context.selectors.getValuePe(this, "before");
    if(!Nehan.Obj.isEmpty(before)){
      content = Nehan.Html.tagWrap("::before", before.content || "") + content;
    }
    var after = this.context.selectors.getValuePe(this, "after");
    if(!Nehan.Obj.isEmpty(after)){
      content = content + Nehan.Html.tagWrap("::after", after.content || "");
    }
    var first_letter = this.context.selectors.getValuePe(this, "first-letter");
    if(!Nehan.Obj.isEmpty(first_letter)){
      content = Nehan.Utils.replaceFirstLetter(content, function(letter){
	return Nehan.Html.tagWrap("::first-letter", letter);
      });
    }
    var first_line = this.context.selectors.getValuePe(this, "first-line");
    if(!Nehan.Obj.isEmpty(first_line)){
      content = Nehan.Html.tagWrap("::first-line", content);
    }
    content = Nehan.Config.formatTagContent(this.flow, content) || content;
    return content;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getHeaderRank = function(){
    if(this.markup.isHeaderTag()){
      return parseInt(this.markup.getName().substring(1), 10);
    }
    return 0;
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getAnchorName = function(){
    return this.markup.getAttr("name") || "";
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getSelectorCacheKey = function(){
    return this.selectorCacheKey;
  };
  /**
   @memberof Nehan.Style
   @param pseudo_element_name {String}
   @return {String}
   */
  Style.prototype.getSelectorCacheKeyPe = function(pseudo_element_name){
    return this.selectorCacheKey + "::" + pseudo_element_name;
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Font}
   */
  Style.prototype.getFont = function(){
    return this.font || this.getParentFont();
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Font}
   */
  Style.prototype.getParentFont = function(){
    return this.parent? this.parent.getFont() : Nehan.Display.getStdFont();
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Style}
   */
  Style.prototype.getRootStyle = function(){
    if(this.isRoot() || !this.parent){
      return this;
    }
    return this.parent.getRootStyle();
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Font}
   */
  Style.prototype.getRootFont = function(){
    return this.getRootStyle().getFont();
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getFontSize = function(){
    return this.getFont().size;
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getFontFamily = function(){
    return this.getFont().family;
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.TextAlign}
   */
  Style.prototype.getTextAlign = function(){
    if(this.textAlign){
      return this.textAlign;
    }
    if(this.parent){
      return this.parent.getTextAlign();
    }
    return Nehan.TextAligns.get("start");
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getTextCombineUpright = function(){
    return this.getCssAttr("text-combine-upright", null);
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getTextOrientation = function(){
    return this.getCssAttr("text-orientation", "mixed");
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getLetterSpacing = function(){
    return this.letterSpacing || 0;
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.ListStyle}
   */
  Style.prototype.getListStyle = function(){
    if(this.listStyle){
      return this.listStyle;
    }
    if(this.display === "list-item" && this.parent){
      return this.parent.getListStyle() || new Nehan.ListStyle(); // default list style
    }
    return null;
  };
  /**
   @memberof Nehan.Style
   @param order {int}
   @return {String}
   */
  Style.prototype.getListMarkerHtml = function(order, opt){
    opt = opt || {};
    if(this.listStyle){
      return this.listStyle.getMarkerHtml(this.flow, order, opt);
    }
    if(this.parent){
      return this.parent.getListMarkerHtml(order, opt);
    }
    return "&nbsp";
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.WordBreak}
   */
  Style.prototype.getWordBreak = function(){
    if(this.wordBreak){
      return this.wordBreak;
    }
    if(this.parent){
      return this.parent.getWordBreak();
    }
    return Nehan.WordBreaks.getInitialValue();
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Color}
   */
  Style.prototype.getColor = function(){
    return this.color || (this.parent? this.parent.getColor() : new Nehan.Color(Nehan.Config.defaultFontColor));
  };
  /**
   @memberof Nehan.Style
   @return {String}
   */
  Style.prototype.getBorderCollapse = function(){
    if(this.borderCollapse){
      return (this.borderCollapse === "inherit")? this.parent.getBorderCollapse() : this.borderCollapse;
    }
    return null;
  };

  /**
   @memberof Nehan.Style
   @return {Nehan.Tag}
   */
  Style.prototype.getPreloadResource = function(){
    var preload_id = this.markup.getData("preloadId", null);
    return (preload_id !== null)? this.context.getPreloadResource(preload_id) : null;
  };

  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getChildCount = function(){
    return this.children.length;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getChildIndex = function(){
    return Math.max(0, Nehan.List.indexOf(this.getParentChildren(), function(child){
      return child === this;
    }.bind(this)));
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getChildNth = function(){
    return this.getChildIndex() + 1;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getChildIndexOfType = function(){
    return Math.max(0, Nehan.List.indexOf(this.getParentChildrenOfType(this.getMarkupName()), function(child){
      return child === this;
    }.bind(this)));
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Style}
   */
  Style.prototype.getNthChild = function(nth){
    return this.children[nth] || null;
  };
  /**
   @memberof Nehan.Style
   @return {Array.<Nehan.Style>}
   */
  Style.prototype.getParentChildren = function(){
    return this.parent? this.parent.children : [];
  };
  /**
   @memberof Nehan.Style
   @param nth {int}
   @return {Nehan.Style}
   */
  Style.prototype.getParentNthChild = function(nth){
    return this.parent? this.parent.getNthChild(nth) : null;
  };
  /**
   @memberof Nehan.Style
   @param markup_name {String}
   @return {Nehan.Style}
   */
  Style.prototype.getParentChildrenOfType = function(markup_name){
    return this.getParentChildren().filter(function(child){
      return child.getMarkupName() === markup_name;
    });
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.BoxFlow}
   */
  Style.prototype.getParentFlow = function(){
    return this.parent? this.parent.flow : this.flow;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getParentFontSize = function(){
    return this.parent? this.parent.getFontSize() : Nehan.Config.defaultFontSize;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getParentContentMeasure = function(){
    return this.parent? this.parent.contentMeasure : screen[this.flow.getPropMeasure()];
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getParentContentExtent = function(){
    return this.parent? this.parent.contentExtent : screen[this.flow.getPropExtent()];
  };
  /**
   @memberof Nehan.Style
   @return {Nehan.Style}
   */
  Style.prototype.getNextSibling = function(){
    return this.next;
  };
  /**
   @memberof Nehan.Style
   @return {float | int}
   */
  Style.prototype.getLineHeight = function(){
    var font = this.getFont();
    return font.lineHeight || Nehan.Config.defaultLineHeight;
  };
  /**
   @memberof Nehan.Style
   @return {float | int}
   */
  Style.prototype.getVerticalAlign = function(){
    return this.getCssAttr("vertical-align", "baseline");
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getEmphaTextBlockExtent = function(){
    return this.textEmpha.getExtent(this.getFontSize());
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getRubyTextBlockExtent = function(){
    var base_font_size = this.getFontSize();
    var extent = Math.floor(base_font_size * (1 + Nehan.Config.defaultRtRate));
    return (base_font_size % 2 === 0)? extent : extent + 1;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getAutoLineExtent = function(){
    return Math.floor(this.getFontSize() * this.getLineHeight());
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getEdgeMeasure = function(flow){
    var edge = this.edge || null;
    return edge? edge.getMeasure(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getEdgeExtent = function(flow){
    var edge = this.edge || null;
    return edge? edge.getExtent(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getEdgeStart = function(flow){
    var edge = this.edge || null;
    return edge? edge.getStart(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getEdgeEnd = function(flow){
    var edge = this.edge || null;
    return edge? edge.getEnd(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getEdgeBefore = function(flow){
    var edge = this.edge || null;
    return edge? edge.getBefore(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getEdgeAfter = function(flow){
    var edge = this.edge || null;
    return edge? edge.getAfter(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getInnerEdgeMeasure = function(flow){
    var edge = this.edge || null;
    return edge? edge.getInnerMeasureSize(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getInnerEdgeExtent = function(flow){
    var edge = this.edge || null;
    return edge? edge.getInnerExtentSize(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @return {int}
   */
  Style.prototype.getInnerEdgeBefore = function(flow){
    var edge = this.edge || null;
    return edge? edge.getInnerBefore(flow || this.flow) : 0;
  };
  /**
   @memberof Nehan.Style
   @param block {Nehan.Box}
   @return {Object}
   */
  Style.prototype.getCssBlock = function(block){
    // notice that box-size, box-edge is box local variable,<br>
    // so style of box-size(content-size) and edge-size are generated at Box::getCssBlock
    var css = {};
    var is_vert = this.isTextVertical();
    css.display = "block";
    if(this.font){
      Nehan.Obj.copy(css, this.font.getCss(this.isRoot()? null : this.getParentFont()));
    }
    if(this.parent && this.getMarkupName() !== "body"){
      Nehan.Obj.copy(css, this.parent.flow.getCss());
    }
    if(this.color){
      Nehan.Obj.copy(css, this.color.getCss());
    }
    if(this.letterSpacing && !is_vert){
      css["letter-spacing"] = this.letterSpacing + "px";
    }
    if(this.floatDirection){
      Nehan.Obj.copy(css, this.floatDirection.getCss(is_vert));
    }
    if(this.boxPosition){
      Nehan.Obj.copy(css, this.boxPosition.getCss());
    }
    if(this.zIndex){
      css["z-index"] = this.zIndex;
    }
    Nehan.Obj.copy(css, this.unmanagedCss.getValues());
    Nehan.Obj.copy(css, block.size.getCss()); // content size
    if(block.edge){
      Nehan.Obj.copy(css, block.edge.getCss());
    }
    Nehan.Obj.copy(css, block.css); // some dynamic values
    return css;
  };
  /**
   @memberof Nehan.Style
   @param line {Nehan.Box}
   @return {Object}
   */
  Style.prototype.getCssLineBlock = function(line){
    // notice that line-size, line-edge is box local variable,
    // so style of line-size(content-size) and edge-size are generated at Box::getBoxCss
    var css = {};
    Nehan.Obj.copy(css, line.size.getCss());
    if(line.edge){
      Nehan.Obj.copy(css, line.edge.getCss());
    }
    if(line.isInlineRoot){
      Nehan.Obj.copy(css, this.flow.getCss());
      css["line-height"] = this.getFontSize() + "px";
    }
    if(!line.isInlineRoot && this.font){
      Nehan.Obj.copy(css, this.font.getCss(this.getParentFont()));
    }
    if(this.color){
      Nehan.Obj.copy(css, this.color.getCss());
    }
    if(this.isTextVertical()){
      css["display"] = "block";
    }
    Nehan.Obj.copy(css, this.unmanagedCss.getValues());
    Nehan.Obj.copy(css, line.css);
    css["background-color"] = this.getCssAttr("background-color", "transparent");
    return css;
  };
  /**
   @memberof Nehan.Style
   @param line {Nehan.Box}
   @return {Object}
   */
  Style.prototype.getCssTextBlock = function(line){
    // notice that line-size, line-edge is box local variable,
    // so style of line-size(content-size) and edge-size are generated at Box::getCssInline
    var css = {};
    Nehan.Obj.copy(css, line.size.getCss());
    if(line.edge){
      Nehan.Obj.copy(css, line.edge.getCss());
    }
    if(this.isTextVertical()){
      css["display"] = "block";
      css["line-height"] = "1em";
      if(Nehan.Env.client.isAppleMobileFamily()){
	css["letter-spacing"] = "-0.001em";
      }
    } else {
      Nehan.Obj.copy(css, this.flow.getCss());
      css["line-height"] = line.maxFontSize + "px";
      if(this.getMarkupName() === "ruby" || this.isTextEmphaEnable()){
	css["display"] = "inline-block";
      }
      if(line.hangingChar){
	delete css["css-float"];
      }
    }
    Nehan.Obj.copy(css, this.unmanagedCss.getValues());
    Nehan.Obj.copy(css, line.css);
    css["background-color"] = this.getCssAttr("background-color", "transparent");
    return css;
  };
  /**
   @memberof Nehan.Style
   @param line {Nehan.Box}
   @return {Object}
   */
  Style.prototype.getCssInlineBlock = function(line){
    var css = this.getCssBlock(line);
    if(this.isTextVertical()){
      if(!this.isFloated()){
	delete css["css-float"];
      }
    } else {
      Nehan.Obj.copy(css, this.flow.getCss());
    }
    css.display = "inline-block";
    return css;
  };
  /**
   @memberof Nehan.Style
   @param parent {Nehan.Box}
   @param image {Nehan.Box}
   @return {Object}
   */
  Style.prototype.getCssImage = function(parent, image){
    var css = {};
    Nehan.Obj.copy(css, image.size.getCss());
    css.display = this.display;
    if(!this.isTextVertical() || this.isPulled() || this.isPushed()){
      Nehan.Obj.copy(css, this.flow.getCss());
    }
    if(image.edge){
      Nehan.Obj.copy(css, image.edge.getCss());
    }
    return css;
  };

  Style.prototype._computeSelectorCacheKey = function(){
    var keys = this.parent? [this.parent.getSelectorCacheKey()] : [];
    keys.push(this.markup.getKey());
    return keys.join(">");
  };

  Style.prototype._computeContentMeasure = function(measure){
    switch(this.boxSizing){
    case "margin-box": return measure - this.getEdgeMeasure();
    case "border-box": return measure - this.getInnerEdgeMeasure();
    case "content-box": return measure;
    default: return measure;
    }
  };

  Style.prototype._computeContentExtent = function(extent){
    switch(this.boxSizing){
    case "margin-box": return extent - this.getEdgeExtent();
    case "border-box": return extent - this.getInnerEdgeExtent();
    case "content-box": return extent;
    default: return extent;
    }
  };

  Style.prototype._computeFontSize = function(val, unit_size){
    var str = String(val).replace(/\/.+$/, ""); // remove line-height value like 'large/150%"'
    var size = Nehan.Config.absFontSizes[str] || str;
    var max_size = this.getParentFontSize();
    var font_size = this._computeUnitSize(size, unit_size, max_size);
    return Math.max(1, Math.min(font_size, Nehan.Config.maxFontSize));
  };

  // [TODO]
  // if em unitted, need to compute strict size.
  Style.prototype._computeLineHeight = function(val){
    var str = String(val);
    if(str.indexOf("%") > 0){
      return parseInt(str, 10) / 100; // 150% -> 1.5
    }
    return parseFloat(val);
  };

  Style.prototype._computeUnitSize = function(val, unit_size, max_size){
    var str = String(val);
    if(str.indexOf("rem") > 0){
      return Nehan.Utils.getEmSize(parseFloat(str), this.getRootFont().size);
    }
    if(str.indexOf("em") > 0){
      return Nehan.Utils.getEmSize(parseFloat(str), unit_size);
    }
    if(str.indexOf("pt") > 0){
      return Nehan.Utils.getPxFromPt(parseFloat(str, 10));
    }
    if(str.indexOf("%") > 0){
      return Nehan.Utils.getPercentValue(parseFloat(str, 10), max_size);
    }
    var px = parseInt(str, 10);
    return isNaN(px)? 0 : px;
  };

  Style.prototype._computeCornerSize = function(val, unit_size){
    var ret = {};
    var max_measure = this.parent? this.parent.contentMeasure : 0;
    var max_extent = this.parent? this.parent.contentExtent: 0;
    for(var prop in val){
      ret[prop] = [0, 0];
      ret[prop][0] = this._computeUnitSize(val[prop][0], unit_size, max_measure);
      ret[prop][1] = this._computeUnitSize(val[prop][1], unit_size, max_extent);
    }
    return ret;
  };

  Style.prototype._computeEdgeSize = function(val, unit_size){
    var ret = {};
    for(var prop in val){
      ret[prop] = this._computeUnitSize(val[prop], unit_size);
    }
    return ret;
  };

  Style.prototype._loadSelectorCss = function(markup, parent){
    switch(markup.getName()){
    case "::marker":
    case "::before":
    case "::after":
    case "::first-letter":
    case "::first-line":
      // notice that style of pseudo-element is defined with parent context.
      var pe_values = this.context.selectors.getValuePe(parent, markup.getPseudoElementName());
      //console.log("[%s::%s] pseudo values:%o", parent.markupName, this.markup.name, pe_values);
      return pe_values;

    default:
      var values = this.context.selectors.getValue(this);
      //console.log("[%s] selector values:%o", this.markup.name, values);
      return values;
    }
  };

  Style.prototype._loadInlineCss = function(markup){
    var style = markup.getAttr("style");
    if(style === null){
      return {};
    }
    var stmts = (style.indexOf(";") >= 0)? style.split(";") : [style];
    var allowed_props = Nehan.Config.allowedInlineStyleProps || [];
    var values = stmts.reduce(function(ret, stmt){
      var nv = stmt.split(":");
      if(nv.length >= 2){
	var prop = Nehan.Utils.trim(nv[0]).toLowerCase();
	var value = Nehan.Utils.trim(nv[1]);
	var entry = Nehan.CssParser.formatEntry(prop, value);
	var fmt_prop = entry.getPropName();
	var fmt_value = entry.getValue();
	if(allowed_props.length === 0 || Nehan.List.exists(allowed_props, Nehan.Closure.eq(fmt_prop))){
	  ret.add(fmt_prop, fmt_value);
	}
      }
      return ret;
    }, new Nehan.CssHashSet()).getValues();
    //console.log("[%s] load inline css:%o", this.markup.name, values);
    return values;
  };

  Style.prototype._disableUnmanagedCssProps = function(unmanaged_css){
    if(this.isTextVertical()){
      // unmanaged 'line-height' is not welcome for vertical-mode.
      unmanaged_css.remove("line-height");
    }
  };

  Style.prototype._registerCssValues = function(values){
    Nehan.Obj.iter(values, function(fmt_prop, value){
      if(this.isCallbackCssProp(fmt_prop)){
	this.callbackCss.add(fmt_prop, value);
      } else if(this.isManagedCssProp(fmt_prop)){
	this.managedCss.add(fmt_prop, this._evalCssAttr(fmt_prop, value));
      } else {
	this.unmanagedCss.add(fmt_prop, this._evalCssAttr(fmt_prop, value));
      }
    }.bind(this));
  };

  Style.prototype._registerPreloadResource = function(res){
    //console.info("set preload resource:%o, this.markup:%o", res, this.markup);
    switch(this.getMarkupName()){
    case "img":
      this.markup.setAttr("width", res.getAttr("width"));
      this.markup.setAttr("height", res.getAttr("height"));
      break;
    case "math":
      // math is still experimental feature.
      // so registration process is defined in plugin(see 'plugins/math/nehan.math.js').
      break;
    }
  };

  Style.prototype._createSelectorContext = function(prop){
    return new Nehan.SelectorContext(prop, this, this.context);
  };

  Style.prototype._loadDisplay = function(){
    switch(this.getMarkupName()){
    case "first-line":
      return "inline";
    case "li-marker":
    case "li-body":
      return "block";
    default:
      return this.getCssAttr("display", "inline");
    }
  };

  Style.prototype._loadFlow = function(){
    var value = this.getCssAttr("flow", "inherit");
    var parent_flow = this.parent? this.parent.flow : Nehan.Display.getStdBoxFlow();
    if(value === "inherit"){
      return parent_flow;
    }
    if(value === "flip"){
      return parent_flow.getFlipFlow();
    }
    return Nehan.BoxFlows.getByName(value);
  };

  Style.prototype._loadBoxPosition = function(){
    var pos_value = this.getCssAttr("position");
    if(!pos_value){
      return null;
    }
    var box_pos = new Nehan.BoxPosition(pos_value);
    var font_size = this.getFontSize();
    Nehan.List.iter(Nehan.Const.cssLogicalBoxDirs, function(dir){
      var value = this.getCssAttr(dir);
      if(value){
	box_pos[value] = this._computeUnitSize(value, font_size);
      }
    }.bind(this));
    return box_pos;
  };

  Style.prototype._loadBorderCollapse = function(){
    return this.getCssAttr("border-collapse");
  };

  Style.prototype._loadColor = function(){
    var value = this.getCssAttr("color", "inherit");
    if(value !== "inherit"){
      return new Nehan.Color(value);
    }
    return null;
  };

  Style.prototype._loadFont = function(opt){
    opt = opt || {};
    var parent_font = this.getParentFont();
    var line_height = this.getCssAttr("line-height", "inherit");
    var css = this.getCssAttr("font", {
      size:"inherit",
      family:"inherit",
      weight:"inherit",
      style:"inherit",
      variant:"inherit",
      lineHeight:"inherit"
    });
    if(line_height !== "inherit"){
      css.lineHeight = line_height;
    }
    var font = new Nehan.Font(css);
    if(parent_font){
      font.inherit(parent_font);
    }
    if(font.size !== parent_font.size){
      font.size = this._computeFontSize(font.size, parent_font.size);
    }
    if(font.lineHeight !== parent_font.lineHeight){
      font.lineHeight = this._computeLineHeight(font.lineHeight);
    }
    // if all inherited, not required to create new one.
    if(!opt.forceLoad && !this.isRoot() && font.isEqual(parent_font)){
      return null;
    }
    //console.log("size:%d, family:%s, weight:%s, style:%s", font.size, font.family, font.weight, font.style);
    return font;
  };

  Style.prototype._loadBoxSizing = function(){
    // content size of lazy element is always fixed.
    if(this.isLazy()){
      return "content-box";
    }
    return this.getCssAttr("box-sizing", "margin-box");
  };

  Style.prototype._loadEdge = function(flow, font_size){
    var padding = this._loadPadding(flow, font_size);
    var margin = this._loadMargin(flow, font_size);
    var border = this._loadBorder(flow, font_size);
    if(padding === null && margin === null && border === null){
      return null;
    }
    return new Nehan.BoxEdge({
      padding:padding,
      margin:margin,
      border:border
    });
  };

  Style.prototype._loadEdgeSize = function(font_size, prop){
    var edge_size = this.getCssAttr(prop);
    if(edge_size === null){
      return null;
    }
    return this._computeEdgeSize(edge_size, font_size);
  };

  Style.prototype._loadPadding = function(flow, font_size){
    var edge_size = this._loadEdgeSize(font_size, "padding");
    if(edge_size === null){
      return null;
    }
    var padding = new Nehan.Padding();
    padding.setSize(flow, edge_size);
    return padding;
  };

  Style.prototype._loadMargin = function(flow, font_size){
    var edge_size = this._loadEdgeSize(font_size, "margin");
    if(edge_size === null){
      return null;
    }
    var margin = new Nehan.Margin();
    margin.setSize(flow, edge_size);

    // if inline, disable margin-before and margin-after.
    if(this.isInline()){
      margin.clearBefore(flow);
      margin.clearAfter(flow);
    }
    return margin;
  };

  Style.prototype._loadBorder = function(flow, font_size){
    var edge_size = this._loadEdgeSize(font_size, "border-width");
    var border_radius = this.getCssAttr("border-radius");
    if(edge_size === null && border_radius === null){
      return null;
    }
    var border = new Nehan.Border();
    if(edge_size){
      border.setSize(flow, edge_size);
    }
    if(border_radius){
      border.setRadius(flow, this._computeCornerSize(border_radius, font_size));
    }
    var border_color = this.getCssAttr("border-color");
    if(border_color){
      border.setColor(flow, border_color);
    }
    var border_style = this.getCssAttr("border-style");
    if(border_style){
      border.setStyle(flow, border_style);
    }
    return border;
  };

  Style.prototype._loadTextAlign = function(){
    var value = this.getCssAttr("text-align", "inherit");
    if(value !== "inherit"){
      return Nehan.TextAligns.get(value);
    }
    return this.getTextAlign();
  };

  Style.prototype._loadTextEmpha = function(){
    var css = this.getCssAttr("text-emphasis", null);
    if(css === null || !css.style || css.style === "none"){
      return null;
    }
    return new Nehan.TextEmpha({
      style:new Nehan.TextEmphaStyle(css.style),
      position:new Nehan.TextEmphaPos(css.position || {hori:"over", vert:"right"}),
      color:(css.color? new Nehan.Color(css.color) : this.getColor())
    });
  };

  Style.prototype._loadFloatDirection = function(){
    var name = this.getCssAttr("float", "none");
    if(name === "none"){
      return null;
    }
    return Nehan.FloatDirections.get(name);
  };

  Style.prototype._loadBreakBefore = function(){
    var value = this.getCssAttr("break-before");
    return value? Nehan.Breaks.getBefore(value) : null;
  };

  Style.prototype._loadBreakAfter = function(){
    var value = this.getCssAttr("break-after");
    return value? Nehan.Breaks.getAfter(value) : null;
  };

  Style.prototype._loadWordBreak = function(){
    var initial = Nehan.WordBreaks.getInitialValue();
    var value = this.getCssAttr("word-break", "inherit");
    return value? Nehan.WordBreaks.getByName(value) : null;
  };

  // same as 'word-wrap' in IE.
  // value: 'break-word' or 'normal'
  /*
  Style.prototype._loadOverflowWrap = function(){
    var inherit = this.parent? this.parent.overflowWrap : "normal";
    return this.getCssAttr("overflow-wrap") || inherit;
  };*/

  Style.prototype._loadWhiteSpace = function(){
    var inherit = this.parent? this.parent.whiteSpace : "normal";
    return this.getCssAttr("white-space", inherit);
  };

  Style.prototype._loadHangingPunctuation = function(){
    var inherit = this.parent? this.parent.hangingPunctuation : "none";
    return this.getCssAttr("hanging-punctuation", inherit);
  };

  Style.prototype._loadListStyle = function(){
    var list_style = this.getCssAttr("list-style", null);
    if(list_style === null){
      return null;
    }
    return new Nehan.ListStyle(list_style);
  };

  Style.prototype._loadLetterSpacing = function(font_size){
    var letter_spacing = this.getCssAttr("letter-spacing");
    if(letter_spacing){
      return this._computeUnitSize(letter_spacing, font_size);
    }
    return null;
  };

  // [TODO] not all element allows direct size via attribute, so check tag name before calling getAttr
  Style.prototype._loadStaticMeasure = function(){
    var prop = this.getPropStaticMeasure();
    var max_size = this.getParentContentMeasure();
    var static_size = this.getAttr(prop, null) || this.getAttr("measure", null) || this.getCssAttr(prop, null) || this.getCssAttr("measure", null);
    if(static_size === null){
      return null;
    }
    return this._computeUnitSize(static_size, this.getFontSize(), max_size);
  };

  // [TODO] not all element allows direct size via attribute, so check tag name before calling getAttr
  Style.prototype._loadStaticExtent = function(){
    var prop = this.getPropStaticExtent();
    var max_size = this.getParentContentExtent();
    var static_size = this.getAttr(prop, null) || this.getAttr("extent", null) || this.getCssAttr(prop, null) || this.getCssAttr("extent", null);
    if(static_size === null){
      return null;
    }
    return this._computeUnitSize(static_size, this.getFontSize(), max_size);
  };

  return Style;
})();
