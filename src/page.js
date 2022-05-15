Nehan.Page = (function(){
  /**
     @memberof Nehan
     @class Page
     @classdesc abstract evaluated page object.
     @constructor
     @param opt {Object}
     @param opt.element {DOMElement} - generated DOMElement.
     @param opt.text {string} - text in page.
     @param opt.seekPos {int} - page seek position in literal string pos.
     @param opt.pageNo {int} - page index starts from 0.
     @param opt.charPos {int} - character position of this page from first page.
     @param opt.charCount {int} - character count included in this page object.
     @param opt.percent {int}
  */
  function Page(opt){
    Nehan.Obj.merge(this, {
      tree:null,
      element:null,
      text:"",
      seekPos:0,
      pageNo:0,
      charPos:0,
      charCount:0,
      percent:0
    }, opt);
  }

  return Page;
})();

