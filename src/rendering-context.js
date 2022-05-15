// system internal context
// undocumented rendering context class
Nehan.RenderingContext = (function(){
  function RenderingContext(opt){
    opt = opt || {};
    this.yieldCount = 0;
    this.terminate = false;
    this.cachedElements = [];
    this.generator = opt.generator || null;
    this.parent = opt.parent || null;
    this.child = opt.child || null;
    this.style = opt.style || null;
    this.text = opt.text || "";
    this.stream = opt.stream || null;
    this.layoutContext = opt.layoutContext || null;
    this.selectors = opt.selectors || new Nehan.Selectors(Nehan.DefaultStyle.create());
    this.singleTagNames = opt.singleTagNames || new Nehan.LowerNameSet();
    this.preloads = opt.preloads || [];
    this.documentContext = opt.documentContext || new Nehan.DocumentContext();
    this.pageEvaluator = opt.pageEvaluator || new Nehan.PageEvaluator(this);
  }

  // -----------------------------------------------
  // utility functions
  // -----------------------------------------------
  var __char_count_of_elements = function(elements){
    return elements.reduce(function(total, element){
      if(!element.charCount && element.elements && element.elements.length > 0){
	return total + __char_count_of_elements(element.elements);
      }
      return total + (element.charCount || 0);
    }, 0);
  };

  // -----------------------------------------------
  // [add]
  // -----------------------------------------------
  RenderingContext.prototype.addPage = function(page){
    this.documentContext.addPage(page);
  };

  RenderingContext.prototype.addSingleTagName = function(name){
    this.singleTagNames.add(name);
  };

  RenderingContext.prototype.addSingleTagNames = function(names){
    this.singleTagNames.addValues(names);
  };

  RenderingContext.prototype.addAnchor = function(anchor_name){
    anchor_name = anchor_name || this.getAnchorName();
    if(anchor_name){
      this.documentContext.addAnchor(anchor_name);
    }
  };

  RenderingContext.prototype.addBlockElement = function(element){
    if(element === null){
      //console.log("[%s]:eof", this._name);
      return Nehan.Results.EOF;
    }
    var flow = this.style.flow;
    var max_size = this.getContextMaxExtentForAdd();
    var max_measure = this.layoutContext.getInlineMaxMeasure();
    var element_size = element.getLayoutExtent(flow);
    var prev_block_count = this.layoutContext.getBlockCount();
    var prev_extent = this.layoutContext.getBlockCurExtent();
    var next_extent = prev_extent + element_size;

    // if layout over, try to cancel after edge.
    if(next_extent > max_size){
      var over_size = next_extent - max_size;
      if(element.edge && (element.edge.getAfter(flow) >= over_size || element_size > this.getRootContentExtent())){
	var cancel_size = element.edge.cancelAfter(flow, over_size);
	next_extent -= cancel_size;
	element_size -= cancel_size;
      }
      // still overflow
      if(next_extent > max_size){
	// if element size is larger than root extent, it's never included. so skip it without caching.
	if(element_size > this.getRootContentExtent()){
	  console.warn("skip too large block element:%o(%d)", element, element_size);
	  return Nehan.Results.SKIP;
	}
	//console.warn("first atomic element overflow:%o(%s)", element, element.toString());
      }
    }

    //this.debugBlockPush(element, element_size);

    if(element.isResumableLine(max_measure) && this.hasChildLayout() && this.child.isInline()){
      this.child.setResumeLine(element);
      return Nehan.Results.SKIP;
    }

    if(next_extent <= max_size){
      this.layoutContext.addBlockElement(element, element_size);
      if(element.hasLineBreak){
	this.documentContext.incLineBreakCount();
      }
    }
    if(next_extent > max_size){
      var result = this.pushCache(element);
      if(result !== Nehan.Results.OK){
	return result;
      }
    }
    if(next_extent >= max_size){
      //console.warn("break after(block over)");
      this.layoutContext.setBreakAfter(true);
    }
    // inherit child block over
    if(element.breakAfter){
      //console.warn("break after(inherit)");
      this.layoutContext.setBreakAfter(true);
    }
    if(this.layoutContext.isBreakAfter()){
      return Nehan.Results.BREAK_AFTER;
    }
    return Nehan.Results.OK;
  };

  // flag from child: lineOver, lineBreak
  // flag to parent: lineBreak
  RenderingContext.prototype.addInlineElement = function(element){
    //console.log("add inline element:%s", (element? element.toString() : "?"));
    if(element === null){
      //console.log("[%s]:eof", this._name);
      return Nehan.Results.EOF;
    }
    var max_size = this.layoutContext.getInlineMaxMeasure();
    var element_size = this.getElementLayoutMeasure(element);
    var prev_measure = this.layoutContext.getInlineCurMeasure(this.style.flow);
    var next_measure = prev_measure + element_size;

    //this.debugInlinePush(element, element_size);

    if(element_size === 0){
      return Nehan.Results.ZERO;
    }
    if(this.layoutContext.getInlineElements().length === 0 && next_measure > max_size && element_size > this.getRootContentMeasure()){
      console.warn("skip too large inline element:%o(%d", element, element_size);
      return Nehan.Results.SKIP; // just skip it.
    }
    if(next_measure <= max_size){
      this.layoutContext.addInlineBoxElement(element, element_size);
      if(element.hangingPunctuation){
	this.addHangingPunctuation(element);
      }
      if(element.hasLineBreak){
	this.layoutContext.setLineBreak(true);
	return Nehan.Results.LINE_BREAK;
      }
      if(element.lineOver){
	this.layoutContext.setLineOver(true);
	return Nehan.Results.OVERFLOW;
      }
    }
    if(next_measure > max_size){
      var result = this.pushCache(element);
      if(result !== Nehan.Results.OK){
	return result;
      }
    }
    if(next_measure >= max_size){
      return Nehan.Results.OVERFLOW;
    }
    return Nehan.Results.OK;
  };

  RenderingContext.prototype.addTextElement = function(element){
    if(element === null){
      return Nehan.Results.EOF;
    }
    var max_size = this.layoutContext.getInlineMaxMeasure();
    var element_size = this.getTextMeasure(element);
    var prev_measure = this.layoutContext.getInlineCurMeasure(this.style.flow);
    var next_measure = prev_measure + element_size;
    var next_token = this.stream.peek();

    //this.debugTextPush(element, element_size);

    if(element_size === 0){
      return Nehan.Results.ZERO;
    }
    // skip head space for first word element if not 'white-space:pre'
    if(prev_measure === 0 &&
       max_size === this.style.contentMeasure &&
       this.style.isPre() === false &&
       next_token instanceof Nehan.Word &&
       element instanceof Nehan.Char &&
       element.isWhiteSpace()){
      return Nehan.Results.SKIP;
    }
    if(next_measure <= max_size){
      this.layoutContext.addInlineTextElement(element, element_size);
    }
    if(next_measure > max_size){
      var result = this.pushCache(element);
      if(result !== Nehan.Results.OK){
	return result;
      }
    }
    if(next_measure >= max_size){
      this.layoutContext.setLineOver(true);
      return Nehan.Results.OVERFLOW;
    }
    return Nehan.Results.OK;
  };

  RenderingContext.prototype.addHangingPunctuation = function(element){
    if(element.hangingPunctuation.style === this.style){
      var chr = this.yieldHangingChar(element.hangingPunctuation.data);
      this.layoutContext.addInlineBoxElement(chr, 0);
    } else {
      this.layoutContext.setHangingPunctuation(element.hangingPunctuation); // inherit to parent generator
    }
  };

  // -----------------------------------------------
  // [clear]
  // -----------------------------------------------
  RenderingContext.prototype.clearCache = function(cache){
    this.cachedElements = [];
  };

  // -----------------------------------------------
  // [convert]
  // -----------------------------------------------
  RenderingContext.prototype.convertInlineToBlock = function(){
    //console.log("[%s]convert inline to block", this.getName());
    if(this.parent && this.parent.isInline()){
      this.parent.convertInlineToBlock();
    }
    if(this.style.isBlock() && this.child && this.child.isInline()){
      //console.log("[%s]convert child(%s) to block gen", this.getName(), this.child.getName());
      this.child.generator = this.createChildBlockGenerator(this.child.style, this.child.stream);
      this.child.generator.context = this.child;
    }
  };
  
  // -----------------------------------------------
  // [create]
  // -----------------------------------------------
  RenderingContext.prototype.create = function(opt){
    return new RenderingContext({
      parent:opt.parent || null,
      style:opt.style || null,
      stream:opt.stream || null,
      layoutContext:this.layoutContext || null,
      selectors:this.selectors, // always same
      preloads:this.preloads, // always same
      singleTagNames:this.singleTagNames, // always same
      documentContext:this.documentContext, // always same
      pageEvaluator:this.pageEvaluator // always same
    });
  };

  RenderingContext.prototype.createHtmlLexer = function(content){
    return new Nehan.HtmlLexer(content, {
      singleTagNames:this.singleTagNames.getValues()
    });
  };

  RenderingContext.prototype.createDocumentStream = function(text){
    var stream = new Nehan.TokenStream({
      filter:Nehan.Closure.isTagName(["!doctype", "html"]),
      lexer:this.createHtmlLexer(text)
    });
    if(stream.isEmptyTokens()){
      stream.tokens = [new Nehan.Tag("html", text)];
    }
    return stream;
  };

  RenderingContext.prototype.createHtmlStream = function(text){
    var stream = new Nehan.TokenStream({
      filter:Nehan.Closure.isTagName(["head", "body"]),
      lexer:this.createHtmlLexer(text)
    });
    if(stream.isEmptyTokens()){
      stream.tokens = [new Nehan.Tag("body", text)];
    }
    return stream;
  };

  RenderingContext.prototype.createRootGenerator = function(root){
    switch(root){
    case "document":
      return new Nehan.DocumentGenerator(this);
    case "html":
      return new Nehan.HtmlGenerator(this);
    default:
      return new Nehan.BodyGenerator(this);
    }
  };

  RenderingContext.prototype.createFlipLayoutContext = function(){
    var measure = this.getParentRestExtent();
    var extent = this.getParentContentMeasure();
    return new Nehan.LayoutContext(
      new Nehan.BlockContext(extent),
      new Nehan.InlineContext(measure)
    );
  };

  RenderingContext.prototype.createInlineLayoutContext = function(){
    return new Nehan.LayoutContext(
      new Nehan.BlockContext(this.getContextMaxExtent()),
      new Nehan.InlineContext(this.getContextMaxMeasure())
    );
  };

  RenderingContext.prototype.createBlockLayoutContext = function(){
    return new Nehan.LayoutContext(
      new Nehan.BlockContext(this.getContextMaxExtent()),
      new Nehan.InlineContext(this.style.contentMeasure)
    );
  };

  RenderingContext.prototype.createInlineBlockLayoutContext = function(){
    return new Nehan.LayoutContext(
      new Nehan.BlockContext(this.getContextMaxExtent()),
      new Nehan.InlineContext(this.getContextMaxMeasure())
    );
  };

  RenderingContext.prototype.createLayoutContext = function(){
    if(this.hasFlipFlow()){
      return this.createFlipLayoutContext();
    }
    if(!this.style || this.style.getMarkupName() === "html"){
      return null;
    }
    if(this.isInline()){
      return this.createInlineLayoutContext();
    }
    if(this.style.isInlineBlock()){
      return this.createInlineBlockLayoutContext();
    }
    return this.createBlockLayoutContext();
  };

  RenderingContext.prototype.createListMarkerOption = function(item_style){
    var list_style = item_style.getListStyle();
    if(!list_style.isImageList()){
      return {};
    }
    return {
      width:item_style.getFontSize(),
      height:item_style.getFontSize()
    };
  };

  RenderingContext.prototype.createListContext = function(){
    var item_tags = this.stream.getTokens();
    var item_count = item_tags.length;
    var indent_size = 0;

    // find max marker size from all list items.
    item_tags.forEach(function(item_tag, index){
      // wee neeed [li][li::marker] context.
      var item_style = this.createTmpChildStyle(item_tag);
      var item_context = this.createChildContext(item_style);
      var marker_tag = new Nehan.Tag("::marker");
      var marker_option = this.createListMarkerOption(item_style);
      var marker_html = this.style.getListMarkerHtml(index + 1, marker_option);
      //console.log("marker_html:%s", marker_html);
      marker_tag.setContent(marker_html);
      var marker_style = item_context.createTmpChildStyle(marker_tag);
      var marker_context = item_context.createChildContext(marker_style);
      var marker_box = new Nehan.InlineGenerator(marker_context).yield();
      var marker_measure = marker_box? marker_box.getLayoutMeasure() : 0;
      //console.log("RenderingContext::marker context:%o", marker_context);
      indent_size = Math.max(indent_size, marker_measure);
    }.bind(this));

    indent_size = Math.max(this.style.getFontSize(), Math.floor((1 + Nehan.Config.defaultListSpacingRate) * indent_size));
    //console.info("indent size:%d, body size:%d", indent_size, (this.style.contentMeasure - indent_size));

    return {
      itemCount:item_count,
      indentSize:indent_size,
      bodySize:(this.style.contentMeasure - indent_size)
    };
  };

  RenderingContext.prototype.createTablePartition = function(stream){
    var pset = new Nehan.PartitionHashSet(), content;
    while(stream.hasNext()){
      var token = stream.get();
      if(token === null){
	break;
      }
      if(token instanceof Nehan.Tag === false){
	continue;
      }
      switch(token.getName()){
      case "tbody": case "thead": case "tfoot":
	content = token.getContent();
	var pset2 = this.createTablePartition(new Nehan.TokenStream({
	  filter:Nehan.Closure.isTagName(["tr"]),
	  lexer:this.createHtmlLexer(content)
	}));
	pset = pset.union(pset2);
	break;

      case "tr":
	content = token.getContent();
	var cell_tags = new Nehan.TokenStream({
	  filter:Nehan.Closure.isTagName(["td", "th"]),
	  lexer:this.createHtmlLexer(content)
	}).getTokens();
	var cell_count = cell_tags.length;
	var partition = this.createCellPartition(cell_tags);
	pset.add(cell_count, partition);
	break;
      }
    }
    stream.rewind();
    return pset;
  };

  RenderingContext.prototype.createCellPartition = function(cell_tags){
    var partition_count = cell_tags.length;
    var partition_units = cell_tags.map(function(cell_tag){
      return this.createCellPartitionUnit(cell_tag, partition_count);
    }.bind(this));
    return new Nehan.Partition(partition_units);
  };

  RenderingContext.prototype.createCellPartitionUnit = function(cell_tag, partition_count){
    var measure = cell_tag.getAttr("measure") || cell_tag.getAttr("width") || null;
    if(measure){
      return new Nehan.PartitionUnit({weight:measure, isStatic:true});
    }
    var content = cell_tag.getContent();
    var lines = cell_tag.getContent().replace(/<br \/>/g, "\n").replace(/<br>/g, "\n").split("\n");
    // this sizing algorithem is not strict, but still effective,
    // especially for text only table.
    var max_line = Nehan.List.maxobj(lines, function(line){ return line.length; });
    var max_weight = Math.floor(this.style.contentMeasure / 2);
    var min_weight = Math.floor(this.style.contentMeasure / (partition_count * 2));
    var weight = max_line.length * this.style.getFontSize();
    // less than 50% of parent size, but more than 50% of average partition size.
    weight = Math.max(min_weight, Math.min(weight, max_weight));

    // but confirm that weight is more than single font size of parent style.
    weight = Math.max(this.style.getFontSize(), weight);
    return new Nehan.PartitionUnit({weight:weight, isStatic:false});
  };

  RenderingContext.prototype.createOutlineElement = function(callbacks){
    return this.createOutlineElementByName("body", callbacks || {});
  };

  RenderingContext.prototype.createOutlineElementByName = function(outline_name, callbacks){
    var outlines = this.documentContext.createOutlineElementByName(outline_name, callbacks);
    return (outlines.length > 0)? outlines[0] : null;
  };

  RenderingContext.prototype.createChildContext = function(child_style, opt){
    opt = opt || {};
    this.child = this.create({
      parent:this,
      style:child_style,
      stream:(opt.stream || this.createStream(child_style))
    });
    child_style.context = this.child;
    return this.child;
  };

  RenderingContext.prototype.createStyle = function(markup, parent_style, args){
    return new Nehan.Style(this, markup, parent_style, args || {});
  };

  RenderingContext.prototype.createChildStyle = function(markup, args){
    return new Nehan.Style(this, markup, this.style, args || {});
  };

  RenderingContext.prototype.createTmpChildStyle = function(markup, args){
    var style = this.createChildStyle(markup, args);
    this.style.removeChild(style);
    return style;
  };

  RenderingContext.prototype.createStream = function(style){
    var markup_name = style.getMarkupName();
    var markup_content = style.getContent();
    if(style.getTextCombineUpright() === "horizontal" || markup_name === "tcy"){
      return new Nehan.TokenStream({
	tokens:[new Nehan.Tcy(markup_content)]
      });
    }
    switch(markup_name){
    case "html":
      var html_stream = new Nehan.TokenStream({
	filter:Nehan.Closure.isTagName(["head", "body"]),
	lexer:this.createHtmlLexer(markup_content)
      });
      if(html_stream.isEmptyTokens()){
	html_stream.tokens = [new Nehan.Tag("body", markup_content)];
      }
      return html_stream;

    case "tbody": case "thead": case "tfoot":
      return new Nehan.TokenStream({
	filter:Nehan.Closure.isTagName(["tr"]),
	lexer:this.createHtmlLexer(markup_content)
      });
    case "tr":
      return new Nehan.TokenStream({
	filter:Nehan.Closure.isTagName(["td", "th"]),
	lexer:this.createHtmlLexer(markup_content)
      });
    case "ul": case "ol":
      return new Nehan.TokenStream({
	filter:Nehan.Closure.isTagName(["li"]),
	lexer:this.createHtmlLexer(markup_content)
      });
    case "word":
      return new Nehan.TokenStream({
	tokens:[new Nehan.Word(markup_content)]
      });
    case "ruby":
      return new Nehan.RubyTokenStream(markup_content);
    default:
      return new Nehan.TokenStream({
	lexer:this.createHtmlLexer(markup_content)
      });
    }
  };

  RenderingContext.prototype.createListItemGenerator = function(item_context){
    var list_style = item_context.style.getListStyle();
    if(list_style.isOutside()){
      return new Nehan.OutsideListItemGenerator(item_context);
    }
    return new Nehan.InsideListItemGenerator(item_context);
  };

  RenderingContext.prototype.createFloatGenerator = function(first_float_gen){
    //console.warn("create float generator!");
    var max_measure = this.layoutContext.getInlineMaxMeasure();
    var float_measure = first_float_gen.context.style.contentMeasure;
    var floated_generators = [first_float_gen];
    if(float_measure > max_measure){
      //console.log("can't create float:(%d > %d)", float_measure, max_measure);
      this.stream.prev();
      first_float_gen.context.lazyOutput = this.yieldWhiteSpace();
      return new Nehan.LazyGenerator(first_float_gen.context);
    }
    this.stream.iterWhile(function(token){
      if(token instanceof Nehan.Text && token.isWhiteSpaceOnly()){
	return true; // skip and continue
      }
      if(token instanceof Nehan.Tag === false){
	return false; // break
      }
      var child_style = this.createChildStyle(token);
      if(!child_style.isFloated()){
	this.style.removeChild(child_style);
	return false; // break
      }
      float_measure += child_style.contentMeasure;
      if(float_measure > max_measure){
	//console.log("skip to next block level:%o", child_style);
	this.style.removeChild(child_style);
	return false; // break
      }
      var generator = this.createChildBlockGenerator(child_style);
      floated_generators.push(generator);
      return true; // continue
    }.bind(this));

    var float_root_style = this.createTmpChildStyle(new Nehan.Tag("float-root"), {display:"block"});
    var float_root_context = this.createChildContext(float_root_style);
    float_root_context.floatedGenerators = floated_generators;

    var space_style = float_root_context.createChildStyle(new Nehan.Tag("space"), {display:"block"});
    var space_context = float_root_context.createChildContext(space_style, {stream:this.stream});
    var space_gen = new Nehan.BlockGenerator(space_context);

    return new Nehan.FloatGenerator(float_root_context);
  };

  RenderingContext.prototype.createChildBlockGenerator = function(child_style, child_stream){
    //console.log("createChildBlockGenerator(%s):%s", child_style.getMarkupName(), child_style.markup.getContent());
    child_stream = child_stream || this.createStream(child_style);
    var child_context = this.createChildContext(child_style, {
      stream:child_stream
    });

    var direct_block = child_context.yieldBlockDirect();
    if(direct_block){
      child_context.lazyOutput = direct_block;
      return new Nehan.LazyGenerator(child_context);
    }

    // switch generator by display
    switch(child_style.display){
    case "list-item":
      return this.createListItemGenerator(child_context);

    case "table":
      return new Nehan.TableGenerator(child_context);

    case "table-row":
      return new Nehan.TableRowGenerator(child_context);

    case "table-cell":
      return new Nehan.TableCellGenerator(child_context);
    }

    // switch generator by markup name
    switch(child_style.getMarkupName()){
    case "details":
    case "blockquote":
    case "figure":
    case "fieldset":
      return new Nehan.SectionRootGenerator(child_context);

    case "section":
    case "article":
    case "nav":
    case "aside":
      return new Nehan.SectionContentGenerator(child_context);

    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return new Nehan.HeaderGenerator(child_context);

    case "ul":
    case "ol":
      return new Nehan.ListGenerator(child_context);

    case "p":
      return new Nehan.ParagraphGenerator(child_context);

    default:
      return new Nehan.BlockGenerator(child_context);
    }
  };

  // create inline root, and parse again.
  // example:
  // <p>foo</p>
  //  => <p(block)><p(inline)><p(text)>foo</p(text)></p(inline)></p(block)>
  // then '<p(inline)'> is inline-root for '<p(block)>'.
  RenderingContext.prototype.createInlineRootGenerator = function(){
    return this.createChildInlineGenerator(this.style, this.stream);
  };

  RenderingContext.prototype.createChildInlineGenerator = function(style, stream){
    var child_context = this.createChildContext(style, {
      stream:(stream || this.createStream(style))
    });

    var direct_block = child_context.yieldInlineDirect(child_context);
    if(direct_block){
      child_context.lazyOutput = direct_block;
      return new Nehan.LazyGenerator(child_context);
    }

    if(this.parent && this.parent.style !== style && style.isInlineBlock()){
      return new Nehan.InlineBlockGenerator(child_context);
    }
    switch(style.getMarkupName()){
    case "::first-line":
      return new Nehan.FirstLineGenerator(child_context);
    case "ruby":
      return new Nehan.TextGenerator(child_context);
    case "a":
      return new Nehan.LinkGenerator(child_context);
    default:
      return new Nehan.InlineGenerator(child_context);
    }
  };

  // @param text {Nehan.Text}
  RenderingContext.prototype.createTextStream = function(text){
    switch(this.style.getTextOrientation()){
    case "sideways":
      return new Nehan.TokenStream({
	tokens:[new Nehan.Word(text.getContent())]
      });
    case "upright":
      return new Nehan.TokenStream({
	lexer:new Nehan.UprightTextLexer(text.getContent())
      });
    case "mixed":
    default:
      return new Nehan.TokenStream({
	lexer:new Nehan.TextLexer(text.getContent())
      });
    }
  };

  RenderingContext.prototype.createChildTextGenerator = function(text){
    return new Nehan.TextGenerator(
      this.createChildContext(this.style, {
	stream:this.createTextStream(text)
      })
    );
  };

  RenderingContext.prototype.createChildTextGeneratorFromStream = function(stream){
    return new Nehan.TextGenerator(
      this.createChildContext(this.style, {
	stream:stream
      })
    );
  };

  RenderingContext.prototype.createBlockBoxClasses = function(){
    var classes = ["nehan-block", "nehan-" + this.getMarkupName()];
    if(this.style.markup.isHeaderTag()){
      classes.push("nehan-header");
    }
    classes = classes.concat(this.style.markup.getClasses());
    return classes;
  };

  RenderingContext.prototype.createLineBoxClasses = function(){
    var classes = ["nehan-inline", "nehan-inline-" + this.style.flow.getName()];
    classes = classes.concat(this.style.markup.getClasses());
    if(!this.isInlineRoot()){
      classes.concat("nehan-" + this.getMarkupName());
    }
    return classes;
  };

  RenderingContext.prototype.createBlockBoxContextEdge = function(){
    if(!this.style.edge){
      return null;
    }
    if(this.style.getMarkupName() === "hr"){
      return this.style.edge; // can't modify
    }
    var use_before_edge = this.isFirstOutput();
    var use_after_edge = !this.hasNext();
    if(use_before_edge && use_after_edge){
      return this.style.edge;
    }
    var edge = this.style.edge.clone();
    if(!use_before_edge){
      edge.clearBefore(this.style.flow);
    }
    if(!use_after_edge){
      edge.clearAfter(this.style.flow);
    }
    return edge;
  };

  RenderingContext.prototype.createBlockBox = function(opt){
    opt = opt || {};
    var elements = opt.elements || this.layoutContext.getBlockElements();
    var measure = (typeof opt.measure !== "undefined")? opt.measure : this.layoutContext.getInlineMaxMeasure();
    var extent = this.getBlockBoxOutputExtent(opt.extent || null);
    var block_char_count = __char_count_of_elements(elements);

    var box = new Nehan.Box({
      display:((this.style.display === "inline-block")? this.style.display : "block"),
      type:"block",
      size:this.style.flow.getBoxSize(measure, extent),
      edge:(opt.noEdge? null : this.createBlockBoxContextEdge()),
      context:this,
      elements:elements,
      content:((typeof opt.content !== "undefined")? opt.content : null),
      classes:this.createBlockBoxClasses(),
      charCount:block_char_count,
      breakAfter:this.layoutContext.isBreakAfter(),
      pushed:this.style.isPushed(),
      pulled:this.style.isPulled()
    });

    return box;
  };

  RenderingContext.prototype.createLineBox = function(opt){
    opt = opt || {};
    var is_inline_root = this.isInlineRoot();
    var elements = opt.elements || this.layoutContext.getInlineElements();
    var measure = is_inline_root? this.getContextMaxMeasure() : this.layoutContext.getInlineCurMeasure();
    var max_extent = opt.maxExtent || this.layoutContext.getInlineMaxExtent() || this.style.getFontSize() || this.staticExtent;
    if(this.style.staticMeasure && !is_inline_root){
      measure = this.style.contentMeasure;
    }
    // if child elements are all zero box, yield page-break to avoid (sized) empty line.
    if(elements.length > 0 && Nehan.List.forall(elements, function(element){
      if(element instanceof Nehan.Box === false){
	return false;
      }
      return element.getLayoutExtent() === 0;
    })){
      return this.yieldPageBreak();
    }
    var line_size = this.style.flow.getBoxSize(measure, max_extent);
    var line_char_count = opt.charCount || this.layoutContext.getInlineCharCount();
    //console.log("[%s]line char count:%d", this._name, line_char_count);

    var line = new Nehan.Box({
      type:"line-block",
      display:"inline",
      size:line_size,
      context:this,
      elements:elements,
      classes:this.createLineBoxClasses(),
      charCount:line_char_count,
      edge:((this.style.edge && !is_inline_root)? this.style.edge : null), // edge of root line is disabled because it's already included by parent block.,
      content:opt.content || null
    });

    line.maxFontSize = this.layoutContext.getInlineMaxFontSize();
    line.maxExtent = this.layoutContext.getInlineMaxExtent();
    line.hasLineBreak = this.layoutContext.hasLineBreak();
    line.lineOver = this.layoutContext.isLineOver();
    line.hangingPunctuation = this.layoutContext.getHangingPunctuation();
    line.isDecorated = Nehan.List.exists(elements, function(element){
      return element instanceof Nehan.Box && (element.isDecorated || element.isDecoratedText());
    });
    line.isInlineRoot = is_inline_root;

    var text_align = this.style.getTextAlign();

    if(is_inline_root){
      // backup other line data. mainly required to restore inline-context.
      line.lineNo = opt.lineNo;
      line.hyphenated = this.layoutContext.isHyphenated();
      line.inlineMeasure = this.layoutContext.getInlineCurMeasure(); // actual measure
      line.classes.push("nehan-root-line");

      // set text-align
      if(text_align.isCenter() || text_align.isEnd()){
	text_align.setAlign(line);
      } else if(text_align.isJustify() && !this.isFloatSpace()){
	text_align.setJustify(line);
      }

      var line_height = this.style.getLineHeight();

      // set line-height
      Nehan.LineHeight.set(this.style.flow, line, line_height);

      // increment line no from block level.
      this.layoutContext.incBlockLineNo();
    }

    // set vertical-align(currently 'baseline' only)
    Nehan.VerticalAlign.setBaseline(this.style.flow, line);

    // if <div><span>[long text]</span></div>,
    // 'span' is only-child of 'div', and responsible for text-justify of [long text].
    if(!is_inline_root &&
       text_align.isJustify() &&
       this.layoutContext.isLineOver() &&
       this.style.isOnlyChild() &&
       this.isFloatSpace() === false &&
       this.parent &&
       (this.parent.isInlineRoot() && this.parent.layoutContext.getInlineMaxMeasure() === this.layoutContext.getInlineMaxMeasure())){
      line.size.setMeasure(this.getFlow(), this.layoutContext.getInlineMaxMeasure());
      line.inlineMeasure = this.layoutContext.getInlineCurMeasure(); // actual measure
      //console.warn("justify only child:%o", line);
      text_align.setJustify(line);
    }

    // set position in parent stream.
    if(this.parent && this.parent.stream){
      line.pos = Math.max(0, this.parent.stream.getPos() - 1);
    }

    if(line.elements.length === 0 && !line.hasLineBreak){
      //console.warn("zero line?", line);
      line.edge = null;
      line.resizeExtent(this.style.flow, 0);
    }
    //console.info("[create line box] %o, yieldCount:%d", line, this.yieldCount);
    return line;
  };

  RenderingContext.prototype.createTextBox = function(opt){
    opt = opt || {};
    //console.log("text box: opt.measure:%d, curMeasure:%d", opt.measure, this.layoutContext.getInlineCurMeasure());
    var elements = opt.elements || this.layoutContext.getInlineElements();
    var extent = this.layoutContext.getInlineMaxExtent() || this.style.getFontSize();
    var measure = opt.measure || this.layoutContext.getInlineCurMeasure();

    if(this.layoutContext.isInlineEmpty()){
      extent = 0;
    } else if(this.style.isTextEmphaEnable()){
      extent = this.style.getEmphaTextBlockExtent();
    } else if(this.style.getMarkupName() === "ruby"){
      extent = this.style.getRubyTextBlockExtent();
    }
    var text_char_count = this.layoutContext.getInlineCharCount();
    //console.log("[%s]text char count:%d", this._name, text_char_count);

    var text_box = new Nehan.Box({
      size:this.style.flow.getBoxSize(measure, extent),
      context:this,
      type:"text-block",
      display:"inline",
      elements:elements,
      classes:["nehan-text-block"].concat(this.style.markup.getClasses()),
      charCount:text_char_count,
      content:(typeof opt.content !== "undefined")? opt.content : null
    });
    text_box.maxFontSize = this.layoutContext.getInlineMaxFontSize() || this.style.getFontSize();
    text_box.maxExtent = extent;
    text_box.hasLineBreak = this.layoutContext.hasLineBreak(); // is line-break is included?
    text_box.hyphenated = this.layoutContext.isHyphenated();
    text_box.lineOver = this.layoutContext.isLineOver(); // is line full-filled?
    text_box.hangingPunctuation = this.layoutContext.getHangingPunctuation();
    text_box.isEmpty = this.layoutContext.isInlineEmpty();

    // set position in parent stream.
    if(this.parent && this.parent.stream){
      text_box.pos = Math.max(0, this.parent.stream.getPos() - 1);
    }
    //console.info("[create text box] %o(isVoid=%o), yieldCount:%d", text_box, text_box.isVoid(), this.yieldCount);
    return text_box;
  };

  // -----------------------------------------------
  // [debug]
  // -----------------------------------------------
  RenderingContext.prototype.debugBlockBox = function(box){
    console.info(
      "[create block box]%o(%s)\n box.breakAfter:%o, context.breakAfter:%o, box.isVoid:%o",
      box,
      box.toString(),
      box.breakAfter,
      this.layoutContext.isBreakAfter(),
      box.isVoid()
    );
  };

  RenderingContext.prototype.debugBlockPush = function(element, extent){
    var name = this.getName();
    var size = element.size;
    var bc = this.layoutContext.block;
    var str = element.toString();
    var max = this.getContextMaxExtentForAdd();
    var prev = bc.curExtent;
    var next = prev + extent;
    var parent_rest = this.parent && this.parent.layoutContext? this.parent.layoutContext.getBlockRestExtent() : this.layoutContext.getBlockRestExtent();
    console.log("[add block] %s:%o(%dx%d), e(%d/%d) -> e(%d/%d), +%d(prest:%d)\n%s", name, element, size.width, size.height, prev, max, next, max, extent, parent_rest, str);
    if(next > max){
      console.warn("over %c%d", "color:red", (next - max));
    }
  };

  RenderingContext.prototype.debugInlinePush = function(element, measure){
    var name = this.getName();
    var ic = this.layoutContext.inline;
    var str = element.toString();
    var max = ic.maxMeasure;
    var prev = ic.curMeasure;
    var next = prev + measure;
    console.log("[add inline] %s:%o(%s), m(%d/%d) -> m(%d/%d), +%d", name, element, str, prev, max, next, max, measure);
  };

  RenderingContext.prototype.debugTextPush = function(element, measure){
    var name = this.getName();
    var ic = this.layoutContext.inline;
    var str = element.data || "";
    var max = ic.maxMeasure;
    var prev = ic.curMeasure;
    var next = prev + measure;
    console.log("[add text] %s:%o(%s), m(%d/%d) -> m(%d/%d), +%d", name, element, str, prev, max, next, max, measure);
  };

  // -----------------------------------------------
  // [end]
  // -----------------------------------------------
  RenderingContext.prototype.endOutlineContext = function(){
    // called when section root(body, blockquote, fieldset, figure, td) ends.
    this.documentContext.addOutlineContext(this.getOutlineContext());
  };

  RenderingContext.prototype.endSectionContext = function(){
    // called when section content(article, aside, nav, section) ends.
    this.getOutlineContext().add({
      name:"end-section",
      type:this.getMarkupName()
    });
  };

  // -----------------------------------------------
  // [extend]
  // -----------------------------------------------
  RenderingContext.prototype.extend = function(opt){
    return new RenderingContext({
      parent:opt.parent || this.parent,
      style:opt.style || this.style,
      stream:opt.stream || this.stream,
      layoutContext:this.layoutContext || this.layoutContext,
      selectors:this.selectors, // always same
      preloads:this.preloads, // always same
      singleTagNames:this.singleTagNames, // always same
      documentContext:this.documentContext, // always same
      pageEvaluator:this.pageEvaluator // always same
    });
  };

  // -----------------------------------------------
  // [find]
  // -----------------------------------------------
  RenderingContext.prototype.find = function(fn){
    if(fn(this)){
      return this;
    }
    if(this.parent){
      return this.parent.find(fn);
    }
    return null;
  };

  // -----------------------------------------------
  // [gen]
  // -----------------------------------------------
  RenderingContext.prototype.genBlockId = function(){
    return this.documentContext.genBlockId();
  };

  RenderingContext.prototype.genRootBlockId = function(){
    return this.documentContext.genRootBlockId();
  };

  // -----------------------------------------------
  // [get]
  // -----------------------------------------------
  RenderingContext.prototype.getDocumentLang = function(){
    return this.documentContext.documentLang;
  };

  RenderingContext.prototype.getLang = function(){
    return this.style.getMarkupAttr("lang") || "";
  };

  RenderingContext.prototype.getFlow = function(){
    return this.style.flow;
  };

  RenderingContext.prototype.getMarkupName = function(){
    return this.style? this.style.getMarkupName() : "";
  };

  RenderingContext.prototype.getMarkupPath = function(){
    return this.style? this.style.getMarkupPath() : "";
  };

  RenderingContext.prototype.getMarkupAttr = function(name){
    return this.style? this.style.getMarkupAttr(name) : "";
  };

  RenderingContext.prototype.getDisplay = function(){
    return this.style? this.style.display : "";
  };

  RenderingContext.prototype.getFontSize = function(){
    return this.style? this.style.getFontSize() : Nehan.Config.defaultFontSize;
  };

  RenderingContext.prototype.getAnchorName = function(){
    return this.style.getAnchorName();
  };

  RenderingContext.prototype.getStreamTokens = function(){
    return this.stream? this.stream.tokens : [];
  };

  RenderingContext.prototype.getRootContentExtent = function(){
    return this.style.getRootStyle().contentExtent;
  };

  RenderingContext.prototype.getRootContentMeasure = function(){
    return this.style.getRootStyle().contentMeasure;
  };

  RenderingContext.prototype.getWritingDirection = function(){
    return "vert"; // TODO
  };

  RenderingContext.prototype.getPage = function(index){
    var page = this.documentContext.pages[index] || null;
    if(page instanceof Nehan.Box){
      page = this.pageEvaluator.evaluate(page);
      this.documentContext.pages[index] = page;
      return page;
    }
    return page;
  };

  RenderingContext.prototype.getPageCount = function(){
    return this.documentContext.getPageCount();
  };

  RenderingContext.prototype.getChildContext = function(){
    return this.child || null;
  };

  RenderingContext.prototype.getPreloadResource = function(res_id){
    return this.preloads[res_id] || null;
  };

  RenderingContext.prototype.getContent = function(){
    return this.stream? this.stream.getSrc() : "";
  };

  RenderingContext.prototype.getListContext = function(){
    if(this.listContext){
      return this.listContext;
    }
    if(this.parent){
      return this.parent.getListContext();
    }
    return null;
  };

  RenderingContext.prototype.getBlockRestExtent = function(){
    return this.layoutContext.getBlockRestExtent();
  };

  RenderingContext.prototype.getContextMaxMeasure = function(){
    // rt is child style of ruby, but inline cursor starts from beginning of parent inline.
    if(this.style.getMarkupName() === "rt"){
      return this.parent.layoutContext.getInlineMaxMeasure();
    }
    var max_size = (this.parent && this.parent.layoutContext)? this.parent.layoutContext.getInlineRestMeasure() : this.style.contentMeasure;
    return Math.min(max_size, this.style.contentMeasure);
  };

  RenderingContext.prototype.getInlineRootMaxMeasure = function(){
    var inline_root = this.find(function(context){
      return context.isInlineRoot();
    });
    var layout_context = inline_root? inline_root.layoutContext : this.layoutContext;
    return layout_context.getInlineMaxMeasure();
  };

  RenderingContext.prototype.getEdgeExtent = function(){
    if(this.generator instanceof Nehan.TextGenerator){
      return 0;
    }
    if(this.isInlineRoot()){
      return 0;
    }
    return this.style.getEdgeExtent(this.style.flow);
  };

  // for box-sizing:border-box
  RenderingContext.prototype.getInnerEdgeBefore = function(){
    if(this.generator instanceof Nehan.TextGenerator){
      return 0;
    }
    if(this.isInlineRoot()){
      return 0;
    }
    return this.style.getInnerEdgeBefore(this.style.flow);
  };

  RenderingContext.prototype.getEdgeBefore = function(){
    if(this.generator instanceof Nehan.TextGenerator){
      return 0;
    }
    if(this.isInlineRoot()){
      return 0;
    }
    return this.style.getEdgeBefore();
  };

  RenderingContext.prototype.getEdgeAfter = function(){
    if(this.generator instanceof Nehan.TextGenerator){
      return 0;
    }
    if(this.isInlineRoot()){
      return 0;
    }
    return this.style.getEdgeAfter();
  };

  RenderingContext.prototype.getBlockBoxOutputExtent = function(direct_extent){
    var auto_extent = this.layoutContext.getBlockCurExtent();
    var static_extent = this.style.staticExtent || null;
    var content_extent = this.style.contentExtent;
    var is_float_space = this.isFloatSpace();
    var is_iblock = this.style.isInlineBlock();

    if(auto_extent === 0 && !this.style.isLazy()){
      return 0;
    }
    if(this.isBody()){
      return content_extent;
    }
    if(is_float_space){
      return Math.min(auto_extent, content_extent);
    }
    if(static_extent){
      return content_extent;
    }
    return direct_extent || auto_extent;
  };

  RenderingContext.prototype.getParentRestExtent = function(){
    if(this.parent && this.parent.layoutContext){
      return this.parent.layoutContext.getBlockRestExtent();
    }
    return null;
  };

  RenderingContext.prototype.getParentContentMeasure = function(){
    if(this.parent && this.parent.layoutContext){
      return this.parent.layoutContext.getInlineMaxMeasure();
    }
    return null;
  };

  // Size of after edge is not removed from content size,
  // because edge of extent direction can be sweeped to next page.
  // In constrast, size of start/end edge is always included,
  // because size of measure direction is fixed in each pages.
  RenderingContext.prototype.getContextMaxExtent = function(){
    var rest_size = this.getParentRestExtent() || this.style.extent;
    var max_size = this.style.staticExtent? Math.min(rest_size, this.style.staticExtent) : rest_size;
    switch(this.style.boxSizing){
    case "content-box":
      return max_size;
    case "border-box":
      return this.isFirstOutput()? Math.max(0, max_size - this.getInnerEdgeBefore()) : max_size;
    case "margin-box": default:
      return this.isFirstOutput()? Math.max(0, max_size - this.getEdgeBefore()) : max_size;
    }
  };

  // max extent size at the phase of adding actual element.
  RenderingContext.prototype.getContextMaxExtentForAdd = function(){
    var max_size = this.layoutContext.getBlockMaxExtent();
    var tail_edge_size = this.getEdgeAfter();

    // if final, tail edge size is required.
    if(!this.hasNext()){
      return max_size - tail_edge_size;
    }
    return max_size;
  };

  RenderingContext.prototype.getElementLayoutExtent = function(element){
    return element.getLayoutExtent(this.style.flow);
  };

  RenderingContext.prototype.getElementLayoutMeasure = function(element){
    return element.getLayoutMeasure(this.style.flow);
  };

  RenderingContext.prototype.getTextMeasure = function(element){
    return element.getAdvance(this.style.flow, this.style.letterSpacing || 0);
  };

  RenderingContext.prototype.getName = function(){
    var markup_name = this.getMarkupPath();
    if(this.generator instanceof Nehan.DocumentGenerator){
      return "(root)";
    }
    if(this.generator instanceof Nehan.TextGenerator){
      return markup_name + "(text)";
    }
    if(this.generator instanceof Nehan.InlineGenerator){
      return markup_name + "(inline)";
    }
    if(this.generator instanceof Nehan.InlineBlockGenerator){
      return markup_name + "(iblock)";
    }
    if(this.generator instanceof Nehan.BlockGenerator){
      return markup_name + "(block)" + (this.hasFlipFlow()? ":flip" : "");
    }
    return markup_name + "(" + this.getDisplay() + ")";
  };

  RenderingContext.prototype.getAnchorPageNo = function(anchor_name){
    return this.documentContext.getAnchorPageNo(anchor_name);
  };
  
  RenderingContext.prototype.getParentStyle = function(){
    return this.parent? this.parent.style : null;
  };

  RenderingContext.prototype.getHeaderRank = function(){
    if(this.style){
      return this.style.getHeaderRank();
    }
    return 0;
  };

  RenderingContext.prototype.getTablePartition = function(){
    if(this.tablePartition){
      return this.tablePartition;
    }
    if(this.parent){
      return this.parent.getTablePartition();
    }
    return null;
  };

  RenderingContext.prototype.getOutlineContext = function(){
    return this.outlineContext || (this.parent? this.parent.getOutlineContext() : null);
  };

  RenderingContext.prototype.getSiblingContext = function(){
    if(this.getMarkupName() === "rt"){
      return null;
    }
    var root_line = this.parent;
    while(root_line && root_line.style === this.style){
      root_line = root_line.parent || null;
    }
    return root_line || this.parent || null;
  };

  RenderingContext.prototype.getSiblingStyle = function(){
    var sibling = this.getSiblingContext();
    return (sibling && sibling.style)? sibling.style : null;
  };

  RenderingContext.prototype.getSiblingStream = function(){
    var sibling = this.getSiblingContext();
    return (sibling && sibling.stream)? sibling.stream : null;
  };

  // -----------------------------------------------
  // [has]
  // -----------------------------------------------
  RenderingContext.prototype.hasNext = function(){
    if(this.terminate){
      return false;
    }
    if(this.hasCache()){
      return true;
    }
    if(this.isLazy()){
      return false;
    }
    if(this.child && this.hasChildLayout()){
      return true;
    }
    if(this.floatGenerators && this.hasNextFloat()){
      return true;
    }
    if(this.parallelGenerators && this.hasNextParallelLayout()){
      return true;
    }
    return this.stream? this.stream.hasNext() : false;
  };

  RenderingContext.prototype.hasChildLayout = function(){
    return this.child && this.child.generator && this.child.generator.hasNext();
  };

  RenderingContext.prototype.hasNextFloat = function(){
    return this.floatedGenerators && Nehan.List.exists(this.floatedGenerators, function(gen){
      return gen.hasNext();
    });
  };

  RenderingContext.prototype.hasNextParallelLayout = function(){
    return this.parallelGenerators && Nehan.List.exists(this.parallelGenerators, function(gen){
      return gen.hasNext();
    });
  };

  RenderingContext.prototype.hasCache = function(){
    return this.cachedElements.length > 0;
  };

  RenderingContext.prototype.hasFloatStackCache = function(){
    return this.floatStackCaches && this.floatStackCaches.length > 0;
  };

  RenderingContext.prototype.hasStaticExtent = function(){
    return (typeof this.style.staticExtent !== "undefined");
  };

  RenderingContext.prototype.hasStaticMeasure = function(){
    return (typeof this.style.staticMeasure !== "undefined");
  };

  RenderingContext.prototype.hasFlipFlow = function(){
    if(!this.parent || !this.parent.style || this.isBody()){
      return false;
    }
    return (this.parent.style.flow !== this.style.flow);
  };

  // -----------------------------------------------
  // [hyphenate]
  // -----------------------------------------------
  // hyphenate between two different inline generator.
  // [example]
  // <p>hoge<ruby>hige<rt>xx</rt></ruby>,hage</p>
  // => line1:hogehige
  // => line2:,hage (head NG!)
  //
  // => line1:hogehige, (hanging punctuation)
  // => line2:hage
  RenderingContext.prototype.hyphenateSibling = function(last_element, sib_context){
    var next_token = sib_context.stream.peek();
    var tail = this.layoutContext.getInlineLastElement();
    var head = (next_token instanceof Nehan.Text)? next_token.getHeadChar() : null;
    //console.log("hyphenate sib:last = %o, tail = %o, head = %o", last_element, tail, head);
    //console.log("cur_context inline.cur = %d, inline.rest = %d", this.layoutContext.inline.curMeasure, this.layoutContext.inline.getRestMeasure());
    //console.log("sib_context inline.cur = %d, inline.rest = %d", sib_context.layoutContext.inline.curMeasure, sib_context.layoutContext.inline.getRestMeasure());

    if(this.layoutContext.getInlineRestMeasure() > sib_context.getFontSize()){
      //console.log("not required!");
      return;
    }
    if(this.style.isHangingPuncEnable() && head && head.isHeadNg()){
      //console.log("hanging punc!");
      next_token.cutHeadChar();
      this.layoutContext.setHangingPunctuation({
	data:head,
	style:this.getSiblingStyle()
      });
      return;
    } else if(tail && tail instanceof Nehan.Char && tail.isTailNg() && this.layoutContext.getInlineElements().length > 1){
      //console.log("sweep!");
      this.layoutContext.popInlineElement();
      this.stream.setPos(tail.pos);
      this.layoutContext.setLineBreak(true);
      this.layoutContext.setHyphenated(true);
      this.clearCache();
    }
  };

  RenderingContext.prototype.hyphenate = function(last_element){
    // by stream.getToken(), stream pos has been moved to next pos already, so cur pos is the next head.
    var line_head_orig = this.peekLastCache() || this.stream.peek(); // original head token of next line.
    //console.log("line_head_orig:%o, last_element:%o", line_head_orig, last_element);
    if(line_head_orig === null){
      //console.log("line_head_orig:%o, last_element:%o", line_head_orig, last_element);
      var sibling = this.getSiblingContext();
      if(sibling && sibling.stream && sibling.layoutContext){
	//console.log("hyphenate sibling sibling:%o", sibling);
	this.hyphenateSibling(last_element, sibling);
      }
      return;
    }
    // hyphenate by hanging punctuation.
    var line_head_next = this.stream.peek();
    line_head_next = (line_head_next && line_head_orig.pos === line_head_next.pos)? this.stream.peek(1) : line_head_next;
    var is_single_head_ng = function(head, line_head_next){
      return (head instanceof Nehan.Char && head.isHeadNg()) &&
	!(line_head_next instanceof Nehan.Char && line_head_next.isHeadNg());
    };
    if(this.style.isHangingPuncEnable() && is_single_head_ng(line_head_orig, line_head_next)){
      this.layoutContext.addInlineTextElement(line_head_orig, 0);
      if(line_head_next){
	this.stream.setPos(line_head_next.pos);
      } else {
	this.stream.get();
      }
      this.layoutContext.setLineBreak(true);
      this.layoutContext.setHyphenated(true);
      this.clearCache();
      return;
    }
    // hyphenate by sweep.
    var line_head_new = this.layoutContext.hyphenateSweep(line_head_orig); // if fixed, new_head token is returned.
    if(line_head_new){
      //console.log("hyphenate by sweep:line_head_orig:%o, line_head_new:%o", line_head_orig, line_head_new);
      var hyphenated_measure = line_head_new.bodySize || 0;
      if(Math.abs(line_head_new.pos - line_head_orig.pos) > 1){
	hyphenated_measure = Math.abs(line_head_new.pos - line_head_orig.pos) * this.style.getFontSize(); // [FIXME] this is not accurate size.
      }
      this.layoutContext.addInlineMeasure(-1 * hyphenated_measure); // subtract sweeped measure.
      //console.log("hyphenate and new head:%o", line_head_new);
      this.stream.setPos(line_head_new.pos);
      this.layoutContext.setLineBreak(true);
      this.layoutContext.setHyphenated(true);
      this.clearCache(); // stream position changed, so disable cache.
    }
  };

  // -----------------------------------------------
  // [init]
  // -----------------------------------------------
  RenderingContext.prototype.initLayoutContext = function(){
    this.layoutContext = this.createLayoutContext();
    if(this.layoutContext){
      //console.log("available space(m = %d, e = %d)", this.layoutContext.getInlineMaxMeasure(), this.layoutContext.getBlockMaxExtent());
    }
    if(this.hasFlipFlow()){
      this.updateContextSize(
	this.layoutContext.getInlineMaxMeasure(),
	this.layoutContext.getBlockMaxExtent()
      );
    }
    if(this.resumeLine){
      this.layoutContext.resumeLine(this.resumeLine);
      this.resumeLine = null;
    }
  };

  RenderingContext.prototype.initBlockClear = function(){
    var value = this.style.getCssAttr("clear");
    if(value){
      this.clear = new Nehan.Clear(value);
    }
  };

  RenderingContext.prototype.initListContext = function(){
    this.listContext = this.createListContext();
    return this.listContext;
  };

  RenderingContext.prototype.initParagraphContext = function(){
    this.style.setMarkupAttr("data-paragraph-id", this.documentContext.paragraphId++);
  };

  RenderingContext.prototype.initTablePartition = function(stream){
    this.tablePartition = this.createTablePartition(stream);
  };

  // -----------------------------------------------
  // [is]
  // -----------------------------------------------
  RenderingContext.prototype.isBody = function(){
    return this.getMarkupName() === "body";
  };

  RenderingContext.prototype.isListBody = function(){
    return this.getMarkupName() === "li-body";
  };

  RenderingContext.prototype.isInline = function(){
    return (
      this.style.isInline() ||
      this.generator instanceof Nehan.TextGenerator ||
      this.generator instanceof Nehan.InlineGenerator
    );
  };

  RenderingContext.prototype.isInlineRoot = function(){
    if(this.isBody()){
      return true;
    }
    if(this.isListBody()){
      return true;
    }
    if(this.parent && this.parent.style !== this.style){
      return false;
    }
    if(this.generator instanceof Nehan.TextGenerator){
      return false;
    }
    return (this.generator instanceof Nehan.InlineGenerator ||
	    this.generator instanceof Nehan.InlineBlockGenerator);
  };

  RenderingContext.prototype.isBreakBefore = function(){
    return this.isFirstOutput() && this.style.isBreakBefore();
  };

  RenderingContext.prototype.isBreakAfter = function(){
    return !this.hasNext() && this.style.isBreakAfter();
  };

  RenderingContext.prototype.isFirstOutput = function(){
    return this.yieldCount === 0;
  };

  RenderingContext.prototype.isTextVertical = function(){
    return this.style.isTextVertical();
  };

  RenderingContext.prototype.isFloatStart = function(){
    return this.style? this.style.isFloatStart() : false;
  };

  RenderingContext.prototype.isFloatEnd = function(){
    return this.style? this.style.isFloatEnd() : false;
  };

  RenderingContext.prototype.isFloatSpace = function(){
    return this.style.getMarkupName() === "space";
  };

  RenderingContext.prototype.isLazy = function(){
    return this.style && this.style.isLazy();
  };

  RenderingContext.prototype.isHyphenateEnable = function(last_element){
    if(this.layoutContext.isInlineEmpty()){
      return false;
    }
    if(this.layoutContext.hasLineBreak()){
      return false;
    }
    if(!this.style.isHyphenationEnable()){
      return false;
    }
    // [tail-ng-char:1em][word:3em(over)] -> hyphenate at [tail-ng-char:1em]
    if(last_element && last_element.getAdvance && last_element.getAdvance() > this.style.getFontSize()){
      return true;
    }
    // if there is space more than 1em, restrict hyphenation.
    if(this.layoutContext.getInlineRestMeasure() >= this.style.getFontSize()){
      return false;
    }
    return true;
  };

  RenderingContext.prototype.isInsidePreBlock = function(){
    return this.parent && this.parent.style.isPre();
  };

  // -----------------------------------------------
  // [peek]
  // -----------------------------------------------
  RenderingContext.prototype.peekLastCache = function(){
    return Nehan.List.last(this.cachedElements);
  };

  RenderingContext.prototype.peekSiblingNextToken = function(){
    var sibling_stream = this.getSiblingStream();
    return sibling_stream? sibling_stream.peek() : null;
  };

  RenderingContext.prototype.peekSiblingNextHeadChar = function(){
    var head_c1;
    var token = this.peekSiblingNextToken();
    if(token instanceof Nehan.Text){
      head_c1 = token.getContent().substring(0,1);
      return new Nehan.Char({data:head_c1});
    }
    // if parent next token is not Nehan::Text,
    // it's hard to find first character, so skip it.
    return null;
  };

  // -----------------------------------------------
  // [pop]
  // -----------------------------------------------
  RenderingContext.prototype.popCache = function(){
    var cache = this.cachedElements.pop();
    if(cache){
      //console.info("use cache:%o(%s)", cache, this.stringOfElement(cache));
      cache.breakAfter = false;
      if(cache.lineOver){
	cache.lineOver = false;
	if(cache.edge){
	  cache.edge.clearEnd(this.getFlow());
	}
      }
    }
    return cache;
  };

  RenderingContext.prototype.popFloatStackCache = function(){
    return this.floatStackCaches.pop();
  };

  // -----------------------------------------------
  // [prefetch]
  // -----------------------------------------------
  RenderingContext.prototype.prefetchContext = function(markups){
    return markups.reduce(function(ctx, markup){
      var style = ctx.createChildStyle(markup);
      return ctx.createChildContext(style);
    }.bind(this), this);
  };

  // -----------------------------------------------
  // [push]
  // -----------------------------------------------
  RenderingContext.prototype.pushCache = function(element){
    var size = (element instanceof Nehan.Box)? element.getLayoutExtent(this.style.flow) : (element.bodySize || 0);
    //console.log("push cache:%o(e = %d, text = %s)", element, size, this.stringOfElement(element));
    element.cacheCount = (element.cacheCount || 0) + 1;
    if(element.cacheCount >= Nehan.Config.maxRollbackCount){
      console.error("too many rollback! context:%o, element:%o(%s)", this, element, this.stringOfElement(element));
      this.setTerminate(true);
      return Nehan.Results.TOO_MANY_ROLLBACK;
    }
    this.cachedElements.push(element);
    return Nehan.Results.OK;
  };

  RenderingContext.prototype.pushFloatStackCache = function(cache){
    this.floatStackCaches = this.floatStackCaches || [];
    this.floatStackCaches.push(cache);
  };

  // -----------------------------------------------
  // [set]
  // -----------------------------------------------
  RenderingContext.prototype.setTerminate = function(status){
    this.terminate = status;
  };

  RenderingContext.prototype.setOwnerGenerator = function(generator){
    this.generator = generator;
    this._name = this.getName();
  };

  RenderingContext.prototype.setParallelGenerators = function(generators){
    this.parallelGenerators = generators;
  };

  RenderingContext.prototype.setResumeLine = function(line){
    //console.warn("setResumeLine:%o(%s)", line, line.toString());
    this.resumeLine = line;
  };

  RenderingContext.prototype.setPageBreak = function(status){
    if(this.isInline() && this.parent){
      this.parent.setPageBreak(status);
    } else if(this.layoutContext){
      this.layoutContext.setBreakAfter(status);
    }
  };

  RenderingContext.prototype.setStyle = function(key, value){
    // if selecte value itself is function, treat it as 'onload' callback.
    if(typeof value === "function"){
      value = {onload:value};
    }
    this.selectors.setValue(key, value);
    return this;
  };

  RenderingContext.prototype.setStyles = function(values){
    for(var key in values){
      this.setStyle(key, values[key]);
    }
    return this;
  };

  // -----------------------------------------------
  // [start]
  // -----------------------------------------------
  RenderingContext.prototype.startOutlineContext = function(){
    // called when section root(body, blockquote, fieldset, figure, td) starts.
    this.outlineContext = new Nehan.OutlineContext(this.getMarkupName());
  };

  RenderingContext.prototype.startSectionContext = function(){
    // called when section content(article, aside, nav, section) starts.
    this.getOutlineContext().add({
      name:"start-section",
      type:this.getMarkupName(),
      pageNo:this.documentContext.getPageNo()
    });
  };

  RenderingContext.prototype.startHeaderContext = function(){
    // called when heading content(h1-h6) starts.
    var header_id = this.documentContext.genHeaderId();
    this.getOutlineContext().add({
      name:"set-header",
      headerId:header_id,
      pageNo:this.documentContext.getPageNo(),
      type:this.getMarkupName(),
      rank:this.style.getHeaderRank(),
      title:this.style.getContent()
    });
    return header_id;
  };

  // -----------------------------------------------
  // [stringOf]
  // -----------------------------------------------
  RenderingContext.prototype.stringOfElement = function(element){
    if(element instanceof Nehan.Box){
      return element.toString();
    }
    return element.data || "<obj>";
  };

  // -----------------------------------------------
  // [update]
  // -----------------------------------------------
  RenderingContext.prototype.updateContextStaticSize = function(measure, extent){
    this.style.staticMeasure = measure;
    this.style.staticExtent = extent;
    this.style.updateContextSize(measure, extent);
  };

  RenderingContext.prototype.updateContextSize = function(measure, extent){
    this.style.updateContextSize(measure, extent);
  };

  RenderingContext.prototype.updateParent = function(parent_context){
    if(this.isInline()){
      this.updateInlineParent(parent_context);
    }
    this.updateBlockParent(parent_context);
  };

  RenderingContext.prototype.updateBlockParent = function(parent_context){
    //console.log("[update block parent] %s > %s", parent_context._name, this._name);
    this.parent = parent_context;
    parent_context.child = this;
    this.updateContextSize(parent_context.style.contentMeasure, parent_context.style.contentExtent);
    if(this.child){
      this.child.updateParent(this);
    }
  };

  RenderingContext.prototype.updateInlineParent = function(parent_context){
    //console.log("[update inline parent] %s > %s", parent_context._name, this._name);
    this.style = parent_context.style;
    this.parent = parent_context;
    parent_context.child = this;
    var cache = this.peekLastCache();
    if(cache && this.generator instanceof Nehan.TextGenerator && cache.setMetrics){
      cache.setMetrics(this.style.flow, this.style.getFont());
    }
    if(this.child){
      this.child.updateParent(this);
    }
  };

  // -----------------------------------------------
  // [yield]
  // -----------------------------------------------
  RenderingContext.prototype.yieldChildLayout = function(){
    return this.child.generator.yield();
  };

  RenderingContext.prototype.yieldWrapBlock = function(measure, extent, elements){
    return new Nehan.Box({
      size:this.style.flow.getBoxSize(measure, extent),
      display:"block",
      context:this,
      elements:elements
    });
  };

  RenderingContext.prototype.yieldPageBreak = function(){
    return new Nehan.Box({
      display:"block",
      context:this,
      size:new Nehan.BoxSize(0,0),
      breakAfter:true
    });
  };

  RenderingContext.prototype.yieldWhiteSpace = function(){
    return new Nehan.Box({
      display:"block",
      context:this,
      size:this.style.flow.getBoxSize(
	this.layoutContext.getInlineMaxMeasure(),
	this.layoutContext.getBlockMaxExtent()
      ),
      elements:[]
    });
  };

  RenderingContext.prototype.yieldClearance = function(){
    if(!this.clear || !this.parent || !this.parent.floatGroup){
      return null;
    }
    var float_group = this.parent.floatGroup;
    var float_direction = float_group.getFloatDirection();
    var direction_name = float_direction.getName();

    // if meet the final output of the last float stack with same clear direction,
    // yield white space but set done status to clear object.
    if(float_group.isLast() && this.clear.hasDirection(direction_name)){
      this.clear.setDone(direction_name);
      return this.yieldWhiteSpace();
    }
    // if any other clear direction that is not cleared, continue yielding white space.
    if(!this.clear.isDoneAll()){
      return this.yieldWhiteSpace();
    }
    return null;
  };

  RenderingContext.prototype.yieldEmpty = function(opt){
    var box = new Nehan.Box({
      display:this.getDisplay(),
      context:this,
      size:new Nehan.BoxSize(0,0)
    });
    box.isEmpty = true;
    Nehan.Obj.copy(box, opt || {});
    return box;
  };

  RenderingContext.prototype.yieldBlockDirect = function(){
    if(this.style.isLazy()){
      return this.yieldLazyBlock();
    }
    switch(this.style.getMarkupName()){
    case "img": return this.yieldImage();
    case "hr": return this.yieldHorizontalRule();
    }
    return null;
  };

  RenderingContext.prototype.yieldInlineDirect = function(child_context){
    if(this.style.isLazy()){
      return this.yieldLazyInline(child_context);
    }
    switch(this.style.getMarkupName()){
    case "img": return this.yieldImage();
    }
    return null;
  };

  RenderingContext.prototype.yieldLazyInline = function(child_context){
    return new Nehan.Box({
      type:"line-block",
      display:"inline-block",
      context:this,
      size:this.style.flow.getBoxSize(this.style.contentMeasure, this.style.contentExtent),
      content:this.style.getContent()
    });
  };

  RenderingContext.prototype.yieldLazyBlock = function(){
    return this.createBlockBox({
      measure:this.style.contentMeasure,
      extent:this.style.contentExtent,
      content:this.style.getContent()
    });
  };

  RenderingContext.prototype.yieldImage = function(){
    // image size always considered as horizontal mode.
    var width = this.style.contentMeasure || this.style.getFontSize();
    var height = this.style.contentExtent || this.style.getFontSize();
    var image = new Nehan.Box({
      display:this.style.display, // inline, block, inline-block
      size:new Nehan.BoxSize(width, height),
      context:this,
      edge:this.style.edge || null,
      classes:["nehan-image"].concat(this.style.markup.getClasses()),
      pushed:this.style.isPushed(),
      pulled:this.style.isPulled(),
      breakAfter:this.style.isBreakAfter()
    });
    return image;
  };

  RenderingContext.prototype.yieldHorizontalRule = function(){
    return this.createBlockBox({
      elements:[],
      extent:2
    });
  };

  RenderingContext.prototype.yieldHangingChar = function(chr){
    chr.setMetrics(this.style.flow, this.style.getFont());
    var font_size = this.style.getFontSize();
    var chr_text = this.createTextBox({
      elements:[chr],
      measure:chr.bodySize,
      extent:font_size,
      charCount:0,
      maxExtent:font_size,
      maxFontSize:font_size
    });
    chr_text.hangingChar = true;
    return chr_text;
  };

  RenderingContext.prototype.yieldParallelBlocks = function(chr){
    var blocks = this.parallelGenerators.map(function(gen){
      return gen.yield();
    });

    if(blocks.every(Nehan.Closure.eq(null))){
      return null;
    }

    var flow = this.style.flow;
    var max_block =  Nehan.List.maxobj(blocks, function(block){
      return block? block.getLayoutExtent(flow) : 0;
    });
    //console.log("max parallel cell:%o(extent = %d)", max_block, max_block.getLayoutExtent());
    var wrap_measure = this.layoutContext.getInlineMaxMeasure();
    var wrap_extent = max_block.getLayoutExtent(flow);
    var inner_extent = max_block.getContentExtent(flow);
    var uniformed_blocks = blocks.map(function(block, i){
      var context = this.parallelGenerators[i].context;
      if(block === null){
	return context.createBlockBox({
	  elements:[],
	  extent:inner_extent
	});
      }
      return block.resizeExtent(flow, inner_extent);
    }.bind(this));

    return this.yieldWrapBlock(wrap_measure, wrap_extent, uniformed_blocks);
  };

  RenderingContext.prototype.yieldFloatStack = function(){
    //console.log("context::yieldFloatStack");
    if(this.hasFloatStackCache()){
      //console.log("context::use float stack cache");
      return this.popFloatStackCache();
    }
    var start_blocks = [], end_blocks = [];
    Nehan.List.iter(this.floatedGenerators, function(gen){
      var block = gen.yield();
      //console.log("float box:%o(content extent:%d)", block, block.getContentExtent());
      if(!block || block.getContentExtent() <= 0){
	return;
      }
      if(gen.context.isFloatStart()){
	start_blocks.push(block);
      } else if(gen.context.isFloatEnd()){
	end_blocks.push(block);
      }
    });
    return new Nehan.FloatGroupStack(this.style.flow, start_blocks, end_blocks);
  };

  RenderingContext.prototype.yieldFloatSpace = function(float_group, measure, extent){
    //console.info("yieldFloatSpace(float_group = %o, m = %d, e = %d)", float_group, measure, extent);
    this.child.updateContextStaticSize(measure, extent);
    this.child.floatGroup = float_group;
    return this.yieldChildLayout();
  };

  return RenderingContext;
})();
