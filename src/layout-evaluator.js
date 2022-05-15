Nehan.LayoutEvaluator = (function(){
  /**
     @memberof Nehan
     @class LayoutEvaluator
     @classdesc evaluate {@link Nehan.Box}, and output DOMElement.
     @constructor
     @param direction {String} - "hori" or "vert"
  */
  function LayoutEvaluator(context, direction){
    this.context = context;
    this.direction = direction;
  }

  /**
   @memberof Nehan.LayoutEvaluator
   @param tree {Nehan.Box}
   @return {DOMElement}
   */
  LayoutEvaluator.prototype.evaluate = function(tree){
    return this._getEvaluator(tree)._evaluate(tree);
  };

  LayoutEvaluator.prototype._getEvaluator = function(tree){
    var is_vert = tree.context.style.isTextVertical();
    if(this.direction === "vert" && !is_vert){
      return new Nehan.HoriEvaluator(this.context);
    }
    if(this.direction === "hori" && is_vert){
      return new Nehan.VertEvaluator(this.context);
    }
    return this;
  };

  LayoutEvaluator.prototype._createElement = function(name, opt){
    opt = opt || {};
    var css = opt.css || {};
    var attrs = opt.attrs? ((opt.attrs instanceof Nehan.TagAttrs)? opt.attrs.attrs : opt.attrs) : {};
    var dataset = opt.attrs? opt.attrs.dataset : {};
    var dom = document.createElement(name);
    if(opt.className){
      dom.className = opt.className;
    }
    if(opt.content){
      dom.innerHTML = opt.content;
    }
    if(typeof opt.blockId !== "undefined"){
      dataset["blockId"] = opt.blockId;
    }
    if(typeof opt.paragraphId !== "undefined"){
      dataset["paragraphId"] = opt.paragraphId;
    }

    // store css value to dom.style[<camelized-css-property>]
    Nehan.Obj.iter(css, function(prop, value){
      try {
	dom.style[Nehan.Utils.camelize(prop)] = value;
      } catch(error){
	console.warn("try to set %s:%o, but failed:%o", prop, value, error);
      }
    });

    // notice that class(className in style object) is given by variable "Box::classes".
    // why? because
    // 1. markup of anonymous line is shared by parent block, but both are given different class names.
    // 2. sometimes we add some special class name like "nehan-div", "nehan-body", "nehan-p"... etc.
    Nehan.Obj.iter(attrs, function(attr_name, value){ // pure attributes(without dataset defined in TagAttrs::attrs)
      // "style" is readonly and "class" is already set by opt.className.
      if(attr_name === "id"){
	dom[attr_name] = Nehan.Css.addNehanPrefix(value);
      } else if(attr_name !== "style" && attr_name !== "class"){
	try {
	  dom[attr_name] = value;
	} catch(e){
	  console.error("try to set %o to %s but failed.", value, attr_name);
	}
      }
    });

    // dataset attributes(defined in TagAttrs::dataset)
    Nehan.Obj.copy(dom.dataset, dataset);
    return dom;
  };

  LayoutEvaluator.prototype._createClearFix = function(clear){
    var div = document.createElement("div");
    div.style.clear = clear || "both";
    return div;
  };

  LayoutEvaluator.prototype._appendChild = function(root, child){
    if(child instanceof Array){
      Nehan.List.iter(child, function(child){
	this._appendChild(root, child);
      }.bind(this));
    } else {
      root.appendChild(child);
    }
  };

  LayoutEvaluator.prototype._evaluate = function(tree, opt){
    var root = this._evalElementRoot(tree, opt || {});
    var dom = root.innerHTML? root : tree.elements.reduce(function(root, child){
      this._appendChild(root, this._evalElementChild(tree, child));
      if(child.withBr){ // annotated to add extra br element
	this._appendChild(root, document.createElement("br"));
      }
      if(child.withClearFix){ // annotated to add extra clear fix element
	this._appendChild(root, this._createClearFix());
      }
      return root;
    }.bind(this), root);
    var hook = tree.getDomHook();
    if(hook){
      hook(new Nehan.DomCreateContext(dom, tree));
    }
    return dom;
  };

  LayoutEvaluator.prototype._evalElementRoot = function(tree, opt){
    opt = opt || {};
    return this._createElement(opt.name || "div", {
      className:tree.getDomClassName(),
      attrs:tree.getAttrs(),
      content:(opt.content || tree.getContent()),
      blockId:tree.blockId,
      paragraphId:tree.paragraphId,
      css:(opt.css || tree.getBoxCss())
    });
  };

  LayoutEvaluator.prototype._evalElementChild = function(parent, child){
    switch(parent.display){
    case "inline":
      if(child instanceof Nehan.Box){
	return this._evalInlineChildElement(parent, child);
      }
      return this._evalInlineChildText(parent, child);
    default:
      return this._evalBlockChildElement(parent, child);
    }
  };

  LayoutEvaluator.prototype._evalBlockChildElement = function(parent, element){
    switch(element.context.style.getMarkupName()){
    case "img":
      return this._evalImage(parent, element);
    case "a":
      return this._evalLink(parent, element);
    default:
      return this.evaluate(element);
    }
  };

  LayoutEvaluator.prototype._evalInlineChildElement = function(parent, element){
    switch(element.context.style.getMarkupName()){
    case "img":
      return this._evalImage(parent, element);
    case "a":
      return this._evalLink(parent, element);
    default:
      return this._evalInlineChildTree(parent, element);
    }
  };

  // override by HoriEvaluator
  LayoutEvaluator.prototype._evalInlineChildTree = function(parent, element){
    return this._evaluate(element);
  };

  LayoutEvaluator.prototype._evalInlineChildText = function(parent, element){
    if(parent.context.style.isTextEmphaEnable() && Nehan.Token.isEmphaTargetable(element)){
      return this._evalEmpha(parent, element);
    }
    return this._evalTextElement(parent, element);
  };

  LayoutEvaluator.prototype._evalImage = function(parent, image){
    return this._evaluate(image, {
      name:"img",
      css:image.getCssImage(parent)
    });
  };

  LayoutEvaluator.prototype._evalLink = function(line, link){
    var uri = new Nehan.Uri(link.context.style.getMarkupAttr("href"));
    var anchor_name = uri.getAnchorName();
    if(anchor_name){
      link.classes.push("nehan-anchor-link");
    }
    return this._evalLinkElement(line, link);
  };

  LayoutEvaluator.prototype._evalTextElement = function(line, text){
    if(text instanceof Nehan.Char){
      return this._evalChar(line, text);
    }
    if(text instanceof Nehan.Word){
      return this._evalWord(line, text);
    }
    if(text instanceof Nehan.Tcy){
      return this._evalTcy(line, text);
    }
    if(text instanceof Nehan.Ruby){
      return this._evalRuby(line, text);
    }
    console.error("invalid text element:%o", text);
    throw "invalid text element"; 
  };

  return LayoutEvaluator;
})();

