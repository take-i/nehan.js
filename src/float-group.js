Nehan.FloatGroup = (function(){
  /**
     @memberof Nehan
     @class FloatGroup
     @classdesc element set with same floated direction.
     @constructor
     @param elements {Array.<Nehan.Box>}
     @param float_direction {Nehan.FloatDirection}
  */
  function FloatGroup(elements, float_direction){
    this.elements = elements || [];
    this.floatDirection = float_direction || Nehan.FloatDirections.get("start");
    this._last = false;
  }

  /**
   @memberof Nehan.FloatGroup
   @return {bool}
   */
  FloatGroup.prototype.isLast = function(){
    return this._last;
  };
  /**
   @memberof Nehan.FloatGroup
   @param is_last {bool}
   */
  FloatGroup.prototype.setLast = function(is_last){
    this._last = is_last;
  };
  /**
   element is popped from float-stack, but unshifted to elements of float-group to keep original stack order.
   *<pre>
   * float-stack  | float-group
   *     [f1,f2]  |        []
   *  => [f1]     |      [f2] (pop f2 from float-stack, unshift f2 to float-group)
   *  => []       |  [f1, f2] (pop f1 from float-stack, unshift f1 to float-group)
   *</pre>

   @memberof Nehan.FloatGroup
   @param element {Nehan.Box}
   */
  FloatGroup.prototype.add = function(element){
    this.elements.unshift(element); // keep original stack order
  };
  /**
   @memberof Nehan.FloatGroup
   @return {boolean}
   */
  FloatGroup.prototype.isFloatStart = function(){
    return this.floatDirection.isStart();
  };
  /**
   @memberof Nehan.FloatGroup
   @return {boolean}
   */
  FloatGroup.prototype.isFloatEnd = function(){
    return this.floatDirection.isEnd();
  };
  /**
   @memberof Nehan.FloatGroup
   @return {Array.<Nehan.Box>}
   */
  FloatGroup.prototype.getElements = function(){
    return this.isFloatStart()? this.elements : Nehan.List.reverse(this.elements);
  };
  /**
   @memberof Nehan.FloatGroup
   @param flow {Nehan.BoxFlow}
   @return {int}
   */
  FloatGroup.prototype.getMeasure = function(flow){
    return this.elements.reduce(function(measure, element){
      return measure + element.getLayoutMeasure(flow);
    }, 0);
  };
  /**
   @memberof Nehan.FloatGroup
   @param flow {Nehan.BoxFlow}
   @return {int}
   */
  FloatGroup.prototype.getExtent = function(flow){
    return this.elements.reduce(function(extent, element){
      return Math.max(extent, element.getLayoutExtent(flow));
    }, 0);
  };
  /**
   @memberof Nehan.FloatGroup
   @return {Nehan.FloatDirection}
   */
  FloatGroup.prototype.getFloatDirection = function(){
    return this.floatDirection;
  };

  /**
   @memberof Nehan.FloatGroup
   @return {int}
   */
  FloatGroup.prototype.getLength = function(){
    return this.elements.length;
  };

  return FloatGroup;
})();

