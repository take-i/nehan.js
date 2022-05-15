var TestStyles = {
  ".lst-inside ul":{
    "list-style-position":"inside"
  },
  ".lst-inside ol":{
    "list-style-position":"inside"
  },
  ".test-pseudo li:first-child":{
    "color":"green"
  },
  ".test-pseudo li:last-child":{
    "background-color":"skyblue"
  },
  ".test-pseudo p:first-of-type":{
    "color":"red"
  },
  ".test-pseudo p:last-of-type":{
    "color":"blue"
  },
  ".test-pseudo-only div:only-of-type":{
    "background-color":"#ccc",
    "color":"white",
    "margin":{"after":"1em"}
  },
  ".test-pseudo-only p:only-child":{
    "background-color":"black",
    "color":"white"
  },
  ".test-pseudo-only2 p":{
    onload:function(ctx){
      var markup = ctx.getMarkup();
      if(ctx.isOnlyOfType()){
	markup.setContent("this is only of type!");

	// you can return multiple values
	ctx.setCssAttr("color", "white");
	ctx.setCssAttr("background", "red");
      } else {
	markup.setContent("this is not only of type..");

	// or set (name,value) directly.
	ctx.setCssAttr("color", "yellow");
	ctx.setCssAttr("background", "blue");
      }
    }
  },
  ".gen-adj-test a~b":{
    "color":"green"
  },
  ".adj-test a+b":{
    "color":"red"
  },
  "span[lang]":{
    "font-weight":"bold"
  },
  "span[lang=pt]":{
    "color":"green"
  },
  "span[lang~=en-us]":{
    "color": "blue"
  },
  "span[lang|=zh]":{
    "color": "red"
  },
  "a[href^=#]":{
    "background-color":"gold"
  },
  "a[href$=.cn]":{
    "color": "red"
  },
  "a[href*=example]":{
    "background-color":"#CCCCCC"
  },
  ".test-stripe li":{
    "color":function(ctx){
      var nth = ctx.getChildIndex();
      return (nth % 2 === 0)? "white" : "orange";
    },
    onload:function(ctx){
      var nth = ctx.getChildIndex();
      ctx.setCssAttr("background-color", (nth % 2 === 0)? "red" : "blue");
    }
  },
  ".test-before::before":{
    "display":"inline",
    "color":"darkred",
    "padding":{
      "end":"5px"
    },
    content:"this is inserted by before"
  },
  ".test-after::after":{
    "display":"inline",
    "color":"green",
    "padding":{
      "start":"5px"
    },
    content:"this is inserted by after"
  },
  ".first-line-larger::first-line":{
    "display":"inline",
    "font-size":"1.6em"
  },
  ".my-callback":{
    onload:function(scontext){
      var markup = scontext.getMarkup();
      var rest_extent = scontext.getRestExtent();
      markup.setContent([
	markup.getContent(),
	"<p>this is added by onload(rest extent = " + rest_extent + " at this point)</p>"
      ].join(""));
    }
  },
  "circular":{
    "display":"block",
    "box-sizing":"content-box",
    "background":"orange",
    "measure":"300px",
    "extent":"300px",
    "margin":{after:"1em"},
    "content":function(ctx){
      if(!ctx.getMarkup().isEmpty()){
	return null;
      }
      return Nehan.List.fold(Nehan.List.create(12), "", function(ret, index){
	return ret + "<div>" + (index + 1) + "番目の子</div>";
      });
    }
  },
  "circular div":{
    "line-height":"1em",
    "color":function(ctx){
      var child_index = ctx.getChildIndex();
      var parent_style = ctx.getParentStyle();
      var active = parseInt(parent_style.markup.getAttr("active", 1), 10);
      return (child_index + 1 === active)? "red" : "black";
    },
    onblock:function(ctx){
      var index = ctx.getChildIndex();
      var is_vert = ctx.isTextVertical();
      var child_count = ctx.getParentChildCount();
      var font_size = ctx.getStyle().getFontSize();
      var center_pos = Math.floor((ctx.getParentBox().getContentExtent() - font_size) / 2);
      var unit_degree = Math.floor(360 / child_count);
      var start_degree = is_vert? 30 : 120;
      var rotate_degree = start_degree + unit_degree * index;
      var translate = is_vert? "translateX(" + center_pos + "px)" : "translateY(" + center_pos + "px)";
      var rotate = "rotate(" + rotate_degree + "deg)";
      var transform = [translate, rotate].join(" ");
      var style = ctx.dom.style;

      style["position"] = "absolute";
      style["-webkit-transform"] = transform;
      style["-moz-transform"] = transform;
      style["-o-transform"] = transform;
      style["-ms-transform"] = transform;
      style["transform"] = transform;
    }
  },
  ".bordered":{
    "line-height":"1em",
    "border-width":"10px",
    "border-style":"solid",
    "border-color":"red",
    "padding":"10px",
    "margin-after":"10px"
  },
  ".radius1":{
    "border-radius":"0px 50px 50px 0px",
    "background-color":"wheat"
  },
  ".radius2":{
    "border-radius":"2em",
    "background-color":"white"
  },
  ".radius3":{
    "border-radius":"8em/3em",
    "background-color":"yellow"
  },
  ".radius4":{
    "border-radius":"40px 10px",
    "background-color":"pink"
  },
  ".radius5":{
    "border-radius":"50%",
    "background-color":"skyblue"
  },
  ".lst-circled-digit > li":{
    "list-style-type":function(ctx){
      var index = ctx.getChildIndex();
      return String.fromCharCode(0x2460 + index);
    }
  },
  "math":{
    display:"block"
  }
};
