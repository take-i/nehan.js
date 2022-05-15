Nehan.OutsideListItemGenerator = (function(){
  /**
   @memberof Nehan
   @class OutsideListItemGenerator
   @classdesc list-item with list-style-position:outside.
   @constructor
   @extends {Nehan.ParallelGenerator}
   @param context {Nehan.RenderingContext}
  */
  function OutsideListItemGenerator(context){
    Nehan.ParallelGenerator.call(this, context);
  }
  Nehan.Class.extend(OutsideListItemGenerator, Nehan.ParallelGenerator);

  OutsideListItemGenerator.prototype._createChildGenerators = function(context){
    var list_context = context.getListContext() || {
      itemCount:0,
      indentSize:context.style.getFontSize(),
      bodySize:context.layoutContext.getInlineMaxMeasure() - context.style.getFontSize()
    };
    var list_index = context.style.getChildIndex();

    // <li><li-marker>..</li-marker><li-body>...</li-body>
    return [
      this._createListMarkerGenerator(context, list_context, list_index),
      this._createListBodyGenerator(context, list_context)
    ];
  };

  OutsideListItemGenerator.prototype._onElement = function(box){
    Nehan.ParallelGenerator.prototype._onElement.call(this, box);
    //console.log("OutsideListItemGenerator::_onElement:%o(%s)", box, box.toString());
    var blocks = box.elements || [];
    var list_body = blocks[1];
    // if list body is empty, disable box.
    if(list_body && list_body.isVoid()){
      //console.warn("OutsideListItemGenerator::_onElement, invalid list body disabled");
      box.elements = [];
      box.resizeExtent(this.context.style.flow, 0);
    }
  };

  OutsideListItemGenerator.prototype._createListMarkerGenerator = function(context, list_context, list_index){
    var content = context.style.getListMarkerHtml(list_index + 1);
    //console.log("marker html:%s", content);
    var marker_markup = new Nehan.Tag("::marker", content);
    var marker_style = context.createChildStyle(marker_markup, {
      float:"start",
      measure:list_context.indentSize
    });
    var marker_context = context.createChildContext(marker_style);
    //console.log("OutsideListItemGenerator::marker context:%o", marker_context);
    return new Nehan.BlockGenerator(marker_context);
  };

  OutsideListItemGenerator.prototype._createListBodyGenerator = function(context, list_context){
    var body_markup = new Nehan.Tag("li-body");
    var body_style = context.createChildStyle(body_markup, {
      display:"block",
      float:"start",
      measure:list_context.bodySize
    });
    var body_context =  context.createChildContext(body_style, {
      stream:context.stream // share li.stream for li-body.stream.
    });
    //console.log("li-body context:%o", body_context);
    return new Nehan.BlockGenerator(body_context);
  };

  return OutsideListItemGenerator;
})();
