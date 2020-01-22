
var test_ParseVar = {

	parseVars: function() {
		var result = parseVars("this.cats[0]+':'+item");
		// TODO
	},

	replaceVar: function() {

		(function() {

			// Make sure indices work with brackets and other stuff.
			var result = replaceVars("this.cats[0]+':'+item", {"item": "this.items[0]"});
			assertEq(result, "this.cats[0]+':'+this.items[0]");

			// Make sure indices are correct when there are function calls.
			result = replaceVars("this.b.functionCall() + item", {"item": "this.items[0]"});
			assertEq(result, "this.b.functionCall() + this.items[0]");

			// Test replacing multiple vars of different lengths:
			result = replaceVars(" cat + item", {"item": "this.items[0]", "cat": "this.cats[0]"});
			assertEq(result, " this.cats[0] + this.items[0]");
		})();

		// Test array of contexts
		(function() {
			let context = [
				{parentC: 'this'},
				{parentB: 'this'},
				{parentA: 'this'}
			];
			let code = 'parentC.parentB.parentA.variables';
			let code2 = replaceVars(code, context);
			assertEq(code2, 'variables');
		})();

		// Test array of contexts in reverse
		(function() {
			let context = [ // same as above but in reverse order
				{parentA: 'this'},
				{parentB: 'this'},
				{parentC: 'this'}
			];
			let code = 'parentC.parentB.parentA.variables';

			let code2 = replaceVars(code, context);
			assertEq(code2, 'parentB.parentA.variables');
		})();
	},

	addThis: function() {
		var result = addThis('this');
		assertEq(result, 'this'); // don't add it twice!
	}
};

var test_Watch = {

	init: function() {
		(function() {
			var o = {a: [0, 1]};
			var wp = new WatchProperties(o);
			wp.subscribe_(['a'], (action, path, value) => {});
			assertEq(o.a.length, 2);
			assertEq(o.a[0], 0);
			assertEq(o.a[1], 1);
		})();

		// Assign proxied.
		(function() {
			var b = {
				items: [{name: 1}]
			};
			watch(b, 'items', ()=>{});

			// Make sure setting an array with a proxied item inside doesn't add the proxy to the underlying object.
			b.items = [b.items[0]]; // new array, proxied original object inside.
			assert(!b.items.$removeProxy[0].$isProxy);
		})();

		// Two watchers of the same array, make sure changing it through one path notifies the other.
		(function() {
			var b = [1, 2, 3];
			var ops = [];

			var b1 = watchProxy(b, function(action, path, value) {
				ops.push('b1');
			});
			var b2 = watchProxy(b, function(action, path, value) {
				ops.push('b2');
			});

			b2[0] = 5;

			assertEq(ops.length, 2);
			assertEq(ops[0], 'b1');
			assertEq(ops[1], 'b2');
		})();


		// Watches with roots on both an object and it's sub-property.
		(function() {

			var a = {
				b1: {parent: undefined},
				b2: [1, 2]
			};
			a.b1.parent = a;
			var called = new Set();

			var aW = watchProxy(a, (action, path, value) => {
				called.add('a.b2');
			});

			var bW = watchProxy(a.b1, (action, path, value) => {
				called.add('b1.parent.b2');
			});

			// Trigger proxies to be created via get, just in case that's needed.
			var v = aW.b1.parent.b2[0];
			v = bW.parent;
			v = v.b2[0];

			var b2 = bW.parent.b2[0] = 5;

			assertEq(a.b2[0], 5);
			assert(called.has('a.b2'));
			assert(called.has('b1.parent.b2'));
		})();

		// Same as above, but with watch() instead of watchProxy.
		(function() {
			var a = {
				b1: {
					c: 1,
					parent: undefined
				},
				b2: [1, 2]
			};
			a.b1.parent = a;
			var called = new Set();

			var cb1 = function(action, path, value) {
				called.add('a.b2');
			};
			watch(a, ['b2'], cb1);

			var cb2 = function(action, path, value) {
				called.add('b1.parent.b2');
			};
			watch(a.b1, ['parent', 'b2'], cb2);


			a.b1.parent.b2[0] = 5;

			assertEq(a.b2[0], 5);
			assert(called.has('a.b2'));
			assert(called.has('b1.parent.b2'));
		})();

		// Test finding proxied items.
		(function() {
			var b = {
				items: [{name: 1}]
			};
			watch(b, 'items', ()=>{
				var item = b.items[0];
				var i = b.items.indexOf(item);
				assertEq(i, 0);
			});

			b.items.push({name: 2});
		})();
	},

	pop: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		wp.subscribe_(['a', 0], (action, path, value) => {});
		wp.subscribe_(['a', 1], (action, path, value) => {});

		assert(wp.subs_);
		o.a.pop();

		assert(wp.subs_); // doesn't remove the watch.  But I think that's correct behavior.
	},

	arrayShift: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var ops = [];
		wp.subscribe_(['a'], function(action, path, value) {
			ops.push(Array.from(arguments));
		});

		o.a.shift(); // remove the 0 from the beginning.

		assertEq(o.a.length, 1);
		assertEq(o.a[0], 1);

		// Make sure we only have one op
		assertEq(JSON.stringify(ops[0]), '["set",["a","length"],1]');
		assertEq(ops.length, 1);

		// Old, from when we notified of every sub-operation:
		//assertEq(JSON.stringify(ops[0]), '["set",["a","0"],1]');
		//assertEq(JSON.stringify(ops[1]), '["delete",["a","1"]]');
	},

	unsubscribe: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var cb = ()=>{};
		wp.subscribe_(['a'], cb);
		assertEq(Object.keys(wp.subs_).length, 1);

		wp.unsubscribe_(['a'], cb);
		assertEq(Object.keys(wp.subs_).length, 0);


		wp.subscribe_(['a', 0], cb);
		assertEq(Object.keys(wp.subs_).length, 1);
		wp.unsubscribe_(['a', 0], cb);
		assertEq(Object.keys(wp.subs_).length, 0);
	},

	unsubscribe2: function() {
		// Make sure unsubscribing a child leaves the parent.  This used to fail.
		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var cb = ()=>{};

		wp.subscribe_(['a'], cb);
		wp.subscribe_(['a', '0'], cb);

		// Unsubscribe one callback from a[0]
		wp.unsubscribe_(['a', '0'], cb);
		assert(o.a.$isProxy);

		// Unsubscribe all callbacks from a[0]
		wp.unsubscribe_(['a', '0']);
		assert(o.a.$isProxy);

		// Unsubscribe last callbacks from a.
		wp.unsubscribe_(['a'], cb);
		assert(!o.a.$isProxy);

		// Make sure we can subscribe back again.
		wp.subscribe_(['a'], cb);
		assert(o.a.$isProxy);
	}
};

var test_XElement = {

	ids: function () {
		class I1 extends XElement {
		}

		I1.html = '<div><span id="s"></span></div>'; // attr must be lowercase.

		// Make sure attribute is set from html.
		var p = new I1();
		//p.s = 2; // disallow
		//console.log(p.s);

		// TODO: Test duplicate id's.
	},

	attributes: function () {


		// Regular, non-data attributes
		// Instantiation overrides definition attribute.
		(function () {
			class AT extends XElement {
			}

			AT.html = '<div title="val1"></div>';

			// Make sure attribute is set from html.
			var a = new AT();
			assertEq(a.getAttribute('title'), 'val1');

			// Overriding attribute.
			var div = document.createElement('div');
			div.innerHTML = '<x-at title="val2">';
			assertEq(div.children[0].getAttribute('title'), 'val2');
		})();


		// Regular attribute
		(function () {
			class M1 extends XElement {
			}

			M1.html = '<div><span id="span" data-attribs="title: titleProp">Text</span></div>';
			var m = new M1();

			m.titleProp = 'val1';
			assertEq(m.span.getAttribute('title'), 'val1');
		})();


		// Bind to sub-property
		(function () {
			class M2 extends XElement {
			}

			M2.html = '<div><span data-attribs="title: span[0].titleProp">Text</span></div>';
			var m = new M2();

			// Ensure the span was created as an array.
			assertEq(m.span.length, 1);
			assertEq(m.span[0].titleProp, undefined); // We make a way to the property but we don't create it.
			assertEq(m.shadowRoot.children[0].getAttribute('title'), null); // prop doesn't exist yet.

			// Set the prop
			m.span[0].titleProp = 'val1';
			assertEq(m.shadowRoot.children[0].getAttribute('title'), 'val1');

			// Set the prop
			m.span[0] = {titleProp: 'val2'};
			assertEq(m.shadowRoot.children[0].getAttribute('title'), 'val2');

			// Set the prop
			m.span = [{titleProp: 'val3'}];
			assertEq(m.shadowRoot.children[0].getAttribute('title'), 'val3');
		})();


		/*
		// Set class properties from attributes
		// This fails because class properties are created in constructor after the super constructor calls initHtml().
		var B = class extends XElement {
			prop = null;
			constructor() {
				super();
				this.prop = null;
			}
		};
		B.html = '<div prop="val"></div>';
		var b = new B();
		assertEq(b.prop, 'val');
		*/
	},

	properties: function () {
		class PR1 extends XElement {
		}

		PR1.html = '<div invalidattr="val1"></div>'; // attr must be lowercase.

		// Make sure attribute is set from html.
		var p = new PR1();
		assert(!p.hasAttribute('invalidattr'));
		assertEq(p.invalidattr, 'val1');
	},

	embed: function () {
		// Embed
		(function () {
			class E1 extends XElement {
			}

			E1.html = '<div title="E1">E1</div>';
			var e1 = new E1();
			assertEq(e1.shadowRoot.innerHTML, 'E1');

			class E2 extends XElement {
			} // e2 wraps e1
			E2.html = '<div><x-e1 title="E2">E1</x-e1></div>';

			var e2 = new E2();
			assertEq(e2.shadowRoot.innerHTML, '<x-e1 title="E2">E1</x-e1>');
		})();

		// Embed with binding to both parent and self.
		(function () {
			class E3 extends XElement {
			}

			E3.html = '<div data-attribs="title: titleText">E1</div>';

			class E4 extends XElement {
			} // e2 wraps e1
			E4.html = '<div><x-e3 id="e3" data-classes="big: isBig">E1</x-e3></div>';

			var e4 = new E4();

			assertEq(e4.e3.getAttribute('title'), null);
			assertEq(e4.e3.getAttribute('class'), null);

			e4.titleText = 'hello';
			e4.e3.isBig = true;

			assertEq(e4.e3.getAttribute('title'), 'hello');
			assertEq(e4.e3.getAttribute('class'), 'big');
		})();


		// Embed with conflicting binding to both parent and self.
		(function () {
			class E5 extends XElement {
			}

			E5.html = '<div data-classes="big1: isBig">E1</div>';

			class E6 extends XElement {
			}

			E6.html = '<div><x-e5 id="e5" data-classes="big2: isBig">E1</x-e5></div>';

			// The data-classes attribute on E5's instantiation overrides the same attribute on E5's definition.
			// But we subscribe to isBig on both E6 and E5.  Setting either updates the class.
			// TODO: We shold define what the best behavior for this case is.  Right now this tests exists only to ensure nothing breaks.
			var e6 = new E6();

			assertEq(e6.e5.getAttribute('class'), null);

			//e6.isBig = true;
			e6.isBig = true;
			assertEq(e6.e5.getAttribute('class'), 'big2');

			e6.e5.isBig = false;
			assertEq(e6.e5.getAttribute('class'), null);

			e6.e5.isBig = true;
			assertEq(e6.e5.getAttribute('class'), 'big2');
		})();

		// Slot
		(function () {
			class S1 extends XElement {
			}

			S1.html = '<div><b><slot>Fallback</slot></b></div>';

			var div = document.createElement('div');
			div.innerHTML = '<x-s1>Hello</x-s1>';

			// Make sure element is placed inside slot.
			assertEq(div.innerHTML, '<x-s1>Hello</x-s1>');
			assertEq(div.childNodes[0].shadowRoot.innerHTML, '<b><slot>Fallback</slot></b>');

		})();

		// Named slots
		(function () {
			class S2 extends XElement {
			}

			S2.html = '<div><i><slot name="f1" id="f1">f1</slot></i><u><slot name="f2" id="f2">f2</slot></u></div>';

			var div = document.createElement('div');
			div.innerHTML = '<x-s2><b slot="f1">Hello</b><s slot="f2">Goodbye</s></x-s2>';
			var s2 = div.childNodes[0];
			//document.body.append(div); // for visual inspection

			assertEq(s2.shadowRoot.children[0].children[0].assignedNodes()[0].outerHTML, '<b slot="f1">Hello</b>');
			assertEq(s2.shadowRoot.children[1].children[0].assignedNodes()[0].outerHTML, '<s slot="f2">Goodbye</s>');

		})();
	},

	misc: function () {

		// data-html bind
		(function () {
			class M3 extends XElement {
			}

			M3.html = '<div><span data-html="spanHtml">Text</span></div>';

			var m = new M3();
			let html = 'some <b>bold</b> text';
			m.spanHtml = html;
			assertEq(m.shadowRoot.children[0].innerHTML, html);
		})();

		// data-text bind
		(function () {
			class M4 extends XElement {
			}

			M4.html = '<div><span data-text="spanHtml">Text</span></div>';

			var m = new M4();
			let text = 'some <b>bold</b> text';
			m.spanHtml = text;
			assertEq(m.shadowRoot.children[0].textContent, text);
		})();

		// Make sure unbinding one element doesn't unsubscribe() other watches.
		(function () {
			class M5 extends XElement {
			}

			M5.html =
				'<div>' +
				'<span data-text="item.name"></span>' +
				'<p data-text="item.name"></p>' +
				'</div>';
			var m = new M5();
			m.item = {name: 1};

			assert(m.item.$isProxy);
			unbindEl(m.shadowRoot.children[1]);
			assert(m.item.$isProxy);
		})();
	},

	dataVal: function () {
		// data-val bind input
		(function () {
			class BV1 extends XElement {
			}

			BV1.html = '<div><input id="input" data-val="value"/></div>';

			// Changing the value sets the input.value.
			var b = new BV1();
			b.value = 'val1';
			assertEq(b.input.value, 'val1');

			// Typing changes the value.
			b.input.value = 'val2';
			b.input.dispatchEvent(new Event('input'));
			assertEq(b.value, 'val2');
		})();

		// data-val bind input checkbox
		(function () {
			class BV2 extends XElement {
			}

			BV2.html = '<div><input id="checkbox" type="checkbox" data-val="value"/></div>';

			// Changing the value sets the input.value.
			var b = new BV2();
			b.value = true;
			assertEq(b.checkbox.checked, true);
			b.value = '1';
			assertEq(b.checkbox.checked, true);
			b.value = '0';
			assertEq(b.checkbox.checked, false);
			b.value = 0;
			assertEq(b.checkbox.checked, false);

			// Typing changes the value.
			b.checkbox.checked = true;
			b.checkbox.dispatchEvent(new Event('input'));
			assertEq(b.value, true);

			b.checkbox.checked = '1';
			b.checkbox.dispatchEvent(new Event('input'));
			assertEq(b.value, true);

			b.checkbox.checked = 0;
			b.checkbox.dispatchEvent(new Event('input'));
			assertEq(b.value, false);
		})();

		// data-val bind select
		(function () {
			class BV3 extends XElement {
			}

			BV3.html =
				'<div>' +
				'<select id="select" data-val="value">' +
				'<option value="0">No</option>' +
				'<option value="1">Yes</option>' +
				'</select>' +
				'</div>';

			// Changing the value sets the input.value.
			var b = new BV3();
			b.value = 1;
			assertEq(b.select.value, '1');

			// Typing changes the value.
			b.select.value = 0;
			b.select.dispatchEvent(new Event('input'));
			assertEq(b.value, '0');
		})();
	},

	dataClasses: function () {

		(function () {
			class C1 extends XElement {
			}

			C1.html = `
				<div>
					<span id="span" data-classes="a: firstClass; b: object.secondClass"></span>
				</div>`;

			var c = new C1();
			assert(!c.span.getAttribute('class'));

			c.firstClass = true;
			assertEq(c.span.getAttribute('class'), 'a');

			c.object.secondClass = true;
			assertEq(c.span.getAttribute('class'), 'a b');

			c.firstClass = 0;
			assertEq(c.span.getAttribute('class'), 'b');

			// Test delete, make sure class attribute is removed.
			delete c.object.secondClass;
			assert(!c.span.hasAttribute('class'));
		})();


		// Test with existing class, evaluated code.
		(function () {
			class C1 extends XElement {
			}

			C1.html = `
				<div>
					<span id="span" data-classes="a: this.num1 + this.num2 === 12" class="b"></span>
				</div>`;

			var c = new C1();
			assertEq(c.span.getAttribute('class'), 'b');

			c.num1 = c.num2 = 6;
			assertEq(c.span.getAttribute('class'), 'b a');

			c.num1 = c.num2 = 5;
			assertEq(c.span.getAttribute('class'), 'b');
		})();
	},

	dataLoop: function () {
		// Simple loop
		(function () {
			class BL1 extends XElement {
			}

			BL1.html =
				'<div data-loop="items:item">' +
				'<span data-text="item"></span>' +
				'</div>';

			var b = new BL1();
			b.items = [1, 2];
			//document.body.appendChild(b);
			assertEq(b.shadowRoot.innerHTML, '<span data-text="item">1</span><span data-text="item">2</span>');

			b.items.pop();
			assertEq(b.shadowRoot.innerHTML, '<span data-text="item">1</span>');

			b.items.pop();
			assertEq(b.shadowRoot.innerHTML, '');

			b.items.push(3);
			assertEq(b.shadowRoot.innerHTML, '<span data-text="item">3</span>');

			b.items[0] = 4;
			assertEq(b.shadowRoot.innerHTML, '<span data-text="item">4</span>');
		})();

		// Loop with sub-properties, whitespace around nodes
		(function () {
			class BL2 extends XElement {
			}

			BL2.html =
				'<div data-loop="items:item">' +
				'   <span data-text="item.a"></span>    ' +
				'</div>';

			var b = new BL2();
			b.items = [{a: 1}, {a: 2}];
			assertEq(b.shadowRoot.innerHTML, '<span data-text="item.a">1</span><span data-text="item.a">2</span>');
		})();

		// Loop with input val binding to children.
		(function () {
			class BL3 extends XElement {
			}

			BL3.html =
				'<div>' +
				'<div data-loop="items:item" id="loop">' +
				'<input data-val="item.a"/>' +
				'</div>' +
				'</div>';

			var b = new BL3();
			b.items = [{a: 1}, {a: 2}];
			assertEq(b.loop.children[0].value, '1');

			b.loop.children[0].value = '2';
			b.loop.children[0].dispatchEvent(new Event('input'));
			assertEq(b.loop.children[0].value, '2');
		})();

		// Loop on nested XElement with val binding.
		(function () {
			class BL4 extends XElement {
			}

			BL4.html =
				'<div>' +
				'<div data-loop="items:item" id="loop">' +
				'<input data-val="item.val"/>' +
				'</div>' +
				'</div>';

			class BL5 extends XElement {
			}

			BL5.html = `
				<div>
					<x-bl4 id="bl4"></x-bl4>
				</div>`;

			var bl5 = new BL5();
			var bl4 = bl5.bl4;
			bl4.items = [{val: 1}, {val: 2}];
			assertEq(bl4.loop.children[0].value, '1');
			assertEq(bl4.loop.children[1].value, '2');

			bl4.loop.children[1].value = '3';
			bl4.loop.children[1].dispatchEvent(new Event('input'));
			assertEq(bl4.items[1].val, '3');
		})();

		// Make sure items within loop are unbound and unwatched.
		(function () {
			class BL5 extends XElement {
			}

			BL5.html = `
				<div>
					<div id="loop" data-loop="items: item">
						<input data-val="item.name">					
					</div>
				</div>`;

			var v = new BL5();
			v.items = [ // This tests uses sub-properties to trigger possible undefiend defererencing.
				{name: 'A'},
				{name: 'B'},
				{name: 'C'}
			];

			// Calls action=set on the parent element, which sends no action="delete"
			v.items = [];
			assertEq(v.loop.children.length, 0);
			//setTimeout(function() {
			//	assert(!watched.get(v)); // The object will be removed from the watched weakmap if it has no subscribers.
			//}, 5000);
		})();

		// Test functions that modify more than one array element.
		(function () {
			class BL6 extends XElement {
			}

			BL6.html = `
				<div data-loop="items: item">
					<input data-val="item.name">					
				</div>`;

			var v = new BL6();
			v.items = [ // This tests uses sub-properties to trigger possible undefiend defererencing.
				{name: 'A'},
				{name: 'B'},
				{name: 'C'}
			];

			var children = v.shadowRoot.children;

			// Reverse
			v.items.reverse();
			assertEq(children[0].value, 'C');
			assertEq(children[1].value, 'B');
			assertEq(children[2].value, 'A');
			assertEq(children.length, 3);


			// Sort
			v.items.sort((a, b) => a.name.localeCompare(b.name));
			assertEq(children[0].value, 'A');
			assertEq(children[1].value, 'B');
			assertEq(children[2].value, 'C');
			assertEq(children.length, 3);

			// Splice
			v.items.splice(1, 1); // Remove B.
			assertEq(children.length, 2);
			assertEq(children[0].value, 'A');
			assertEq(children[1].value, 'C');
			assertEq(children.length, 2);


			// Splice to add
			v.items.splice(1, 0, {name: 'B'});
			assertEq(children[0].value, 'A');
			assertEq(children[1].value, 'B');
			assertEq(children[2].value, 'C');
			assertEq(children.length, 3);


			// shift() to remove first item.
			v.items.shift();
			assertEq(children[0].value, 'B');
			assertEq(children[1].value, 'C');
			assertEq(children.length, 2);
		})();


		// Reassign whole loop variable multiple times to make sure we don't lose the subscription.
		(function () {
			class BL7 extends XElement {
			}

			BL7.html = `
			<div>
				<div id="loop" data-loop="items: item">
					<input data-val="item.name">
				</div>
			</div>`;

			var v = new BL7();
			v.items = [
				{name: 'A'},
				{name: 'B'},
				{name: 'C'}
			];
			assertEq(v.loop.children.length, 3);


			v.items = [
				{name: 'D'}
			];
			assertEq(v.loop.children.length, 1);


			v.items = [];
			assertEq(v.loop.children.length, 0);


			v.items = [
				{name: 'F'},
				{name: 'G'},
				{name: 'H'}
			];
			assertEq(v.loop.children.length, 3);
		})();

		// bound data is not a direct child of loop (this used to fail due to a bug in getContext()).
		(function () {
			class BL8 extends XElement {
			}

			BL8.html = `
				<div data-loop="items: item">
					<div>
						<input data-val="item">
					</div>
				</div>`;

			var b = new BL8();
			b.items = [1, 2];
			assertEq(b.shadowRoot.children[0].children[0].value, '1');
			assertEq(b.shadowRoot.children[1].children[0].value, '2');
		})();


		// Loop with index.
		(function () {
			class BL9 extends XElement {
			}

			BL9.html = `
				<div data-loop="items: i, item">
					<span data-text="i"></span>
				</div>`;

			var b = new BL9();
			b.items = ['A', 'B'];
			assertEq(b.shadowRoot.innerHTML, '<span data-text="i">0</span><span data-text="i">1</span>');
		})();


		// Make sure loop items property unsubscribe as they're removed.  This used to fail.
		(function () {
			class BL10 extends XElement {
			}

			BL10.html =
				'<div data-loop="items:item">' +
				'<span data-text="item.name"></span>' +
				'</div>';

			var b = new BL10();
			window.b = b;
			b.items = [{name: 1}, {name: 2}];

			b.items.splice(0, 1);
			var subs = Object.keys(watched.get(b).subs_);
			assertEq(subs[0], '"items"');
			assertEq(subs[1], '"items","0","name"');
			assertEq(subs.length, 2);


			b.items.splice(0, 1);
			subs = Object.keys(watched.get(b).subs_);
			assertEq(subs[0], '"items"');
			assertEq(subs.length, 1);
		})();

		// Loop over var that doesn't initially exist.
		(function () {

			class BL11 extends XElement {
			}

			BL11.html = `				
				<div data-loop="parts.wheels: wheel">
				    <span></span>
				</div>`;

			var p = new BL11();
			p.parts = undefined; // TypeError is caught.  Can't evaluate code of loop.
		})();

		// Async
		(function () {
			class Wheel12 extends XElement {
			}

			Wheel12.html = `				
			<div>
			    <b>Wheel</b>
			</div>`;

			class Car12 extends XElement {
			}

			Car12.html = `				
			<div data-loop="wheels: wheel">
			    <x-wheel12 data-attribs="title: wheel"></x-wheel12>
			</div>`;
			var c = new Car12();
			c.wheels = [];
			c.wheels.push(1);
			setTimeout(function () {
				c.wheels.push(1);

				// This used to fail when done asynchronously, back when we used connectedCallback()
				assert(c.shadowRoot.children[1].shadowRoot);
			}, 10);
		})();


		// Splice to rearrange loop with identical items
		(function () {
			class BL1 extends XElement {
			}

			class BL13 extends XElement {
			}

			BL13.html = `				
				<div data-loop="wheels: wheel">
				    <span data-text="wheel"></span>
				</div>`;
			var c = new BL13();

			c.wheels = [1, 1, 1];

			var span2 = c.shadowRoot.children[1];

			c.wheels.splice(0, 1);

			assertEq(c.shadowRoot.children.length, 2);
			assertEq(span2.parentNode, c.shadowRoot); // Make sure we didn't delete and recreate it.
		})();


		// Two loops over same array.
		(function () {
			class BL14 extends XElement {
			}

			BL14.html = `
				<div>
					<div id="loop1" data-loop="items:item">
						<span data-text="item"></span>
					</div>
					<div id="loop2" data-loop="items:item">
						<span data-text="item"></span>
					</div>
				</div>
			`;

			var b = new BL14();
			b.items = [1, 2];
			assertEq(b.loop1.children[0].innerText, '1');
			assertEq(b.loop1.children[1].innerText, '2');
			assertEq(b.loop1.children.length, 2);
			assertEq(b.loop2.children[0].innerText, '1');
			assertEq(b.loop2.children[1].innerText, '2');
			assertEq(b.loop2.children.length, 2);

			b.items.push(3);
			assertEq(b.loop1.children[0].innerText, '1');
			assertEq(b.loop1.children[1].innerText, '2');
			assertEq(b.loop1.children[2].innerText, '3');
			assertEq(b.loop1.children.length, 3);
			assertEq(b.loop2.children[0].innerText, '1');
			assertEq(b.loop2.children[1].innerText, '2');
			assertEq(b.loop2.children[2].innerText, '3');
			assertEq(b.loop1.children.length, 3);
		})();

		// TODO: Test loop over non-simple var.
	},

	dataLoopNested: function () {

		// Nested loop over two separate properties
		(function () {

			class BL30 extends XElement {
			}

			BL30.html = `
				<div data-loop="numbers:number">
					<div data-loop="letters:letter">
						<span data-text="number+\':\'+letter">Hi</span>
					</div>
				</div>`;

			var b = new BL30();
			b.numbers = [1, 2];
			b.letters = ['A', 'B'];


			assertEq(b.shadowRoot.children[0].children[0].textContent, '1:A');
			assertEq(b.shadowRoot.children[0].children[1].textContent, '1:B');
			assertEq(b.shadowRoot.children[0].children.length, 2);

			assertEq(b.shadowRoot.children[1].children[0].textContent, '2:A');
			assertEq(b.shadowRoot.children[1].children[1].textContent, '2:B');
			assertEq(b.shadowRoot.children[1].children.length, 2);

			assertEq(b.shadowRoot.children.length, 2);


			// Since this removes all children, it will convert cats back to a regular field instead of a defined property.
			// But it should convert it back to a proxy when rebuildChildren() is called.
			b.numbers.pop();
			assertEq(b.shadowRoot.children[0].children[0].textContent, '1:A');
			assertEq(b.shadowRoot.children[0].children[1].textContent, '1:B');
			assertEq(b.shadowRoot.children[0].children.length, 2);

			assertEq(b.shadowRoot.children.length, 1);

			b.letters.push('C');

			assertEq(b.shadowRoot.children[0].children[0].textContent, '1:A');
			assertEq(b.shadowRoot.children[0].children[1].textContent, '1:B');
			assertEq(b.shadowRoot.children[0].children[2].textContent, '1:C');
			assertEq(b.shadowRoot.children[0].children.length, 3);

			assertEq(b.shadowRoot.children.length, 1);

		})();

		// Nested loop over sub properties.
		(function () {
			class BL31 extends XElement {
			}

			BL31.html =
				'<div data-loop="families:family">' +
				'<div data-loop="family.species:species">' +
				'<span data-text="family.name+\':\'+species">Hi</span>' +
				'</div>' +
				'</div>';

			var b = new BL31();
			b.families = [
				{
					name: 'equids',
					species: ['horse', 'donkey', 'zebra']
				},
				{
					name: 'cats',
					species: ['lion', 'tiger']
				}
			];

			assertEq(b.shadowRoot.innerHTML,
				'<div data-loop="family.species:species">' +
				'<span data-text="family.name+\':\'+species">equids:horse</span>' +
				'<span data-text="family.name+\':\'+species">equids:donkey</span>' +
				'<span data-text="family.name+\':\'+species">equids:zebra</span>' +
				'</div>' +
				'<div data-loop="family.species:species">' +
				'<span data-text="family.name+\':\'+species">cats:lion</span>' +
				'<span data-text="family.name+\':\'+species">cats:tiger</span>' +
				'</div>');
		})();

		// Nested loop with index.
		(function () {
			class BL32 extends XElement {
			}

			BL32.html = `
				<div data-loop="items: i, item">
					<p data-loop="items: j, item2">
						<span data-text="i+j"></span>
					</p>
				</div>`;

			var b = new BL32();

			b.items = [1, 2];
			assertEq(b.shadowRoot.innerHTML, '<p data-loop="items: j, item2"><span data-text="i+j">0</span><span data-text="i+j">1</span></p><p data-loop="items: j, item2"><span data-text="i+j">1</span><span data-text="i+j">2</span></p>');

		})();

		// Nested loop with duplicate loopVar.
		(function () {
			class BL33 extends XElement {
			}

			BL33.html = `
				<div data-loop="items: i, item">
					<div data-loop="items: i2, item">
						<span data-text="i"></span>
					</div>
				</div>`;

			var b = new BL33();

			var error;
			try {
				b.items = [1, 2];
			} catch (e) {
				error = e;
			}

			assert(error instanceof XElementError);
		})();

		// Nested loop with duplicate index.
		(function () {
			class BL34 extends XElement {
			}

			BL34.html = `
				<div data-loop="items: i, item">
					<div data-loop="items: i, item2">
						<span data-text="i"></span>
					</div>
				</div>`;

			var b = new BL34();

			var error;
			try {
				b.items = [1, 2];
			} catch (e) {
				error = e;
			}

			assert(error instanceof XElementError);
		})();
	},

	events: function () {
		(function () {
			class EV1 extends XElement {
				click(e) {
					this.event = e;
					this.target = e.target;
				}

				click2() {
					this.itWorked2 = true;
				}

				click3() {
					this.itWorked3 = true;
				}

				click4() {
					this.itWorked4 = true;
				}
			}

			EV1.html =
				'<div>' +
				'<span id="bt1" onclick="click(event)">Button</span>' +
				'<span id="bt2" onclick="click2()">Button</span>' +
				'<span id="bt3" onclick="this.click3()">Button</span>' +
				'<span id="bt4" onclick="var a=1; this.click4(); var b=2;">Button</span>' +
				'</div>';

			var e = new EV1();

			// dispatchEvent invokes event handlers synchronously.
			// https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent
			var ev = new Event('click');
			//Object.defineProperty(ev, 'target', {writable: false, value: e.btn1}); // stackoverflow.com/a/49122553
			e.bt1.dispatchEvent(ev);
			assert(e.event instanceof Event);
			assertEq(e.target, e.bt1); // fails!

			e.bt2.dispatchEvent(new Event('click'));
			assert(e.itWorked2);

			e.bt3.dispatchEvent(new Event('click'));
			assert(e.itWorked3);

			e.bt4.dispatchEvent(new Event('click'));
			assert(e.itWorked4);
		})();

		// Make sure events can access the loop context.
		(function () {
			class EV2 extends XElement {
			}

			EV2.html = `
				<div data-loop="items: i, item">
					<span onclick="this.result = i + item"></span>
				</div>`;

			var b = new EV2();
			b.items = ['A', 'B'];

			b.shadowRoot.children[0].dispatchEvent(new Event('click'));
			assertEq(b.result, '0A');

			b.shadowRoot.children[1].dispatchEvent(new Event('click'));
			assertEq(b.result, '1B');
		})();

		// Event attribute on definition and instantiation:
		(function () {
			class EV3Inner extends XElement {
				inner() {
					this.clicked = true;
				}
			}

			EV3Inner.html = `<div onclick="this.inner()"></div>`;

			class EV3Outer extends XElement {
				outer() {
					this.clicked = true;
				}
			}

			EV3Outer.html = '<div><x-ev3inner id="inner" onclick="this.outer()"></x-ev3inner></div>';

			var outer = new EV3Outer();

			outer.inner.dispatchEvent(new Event('click'));

			assert(outer.clicked);
			assert(outer.inner.clicked);
		})();

		// Make sure we don't try to call the function on the inner element.
		(function () {
			class EV4Inner extends XElement {
			}

			EV4Inner.html = `<div>hi</div>`;

			class EV4Outer extends XElement {
				outer() {
					this.clicked = true;
				}
			}

			EV4Outer.html = '<div><x-ev4inner id="inner" onclick="this.outer()"></x-ev4inner></div>';

			var outer = new EV4Outer();

			outer.inner.dispatchEvent(new Event('click'));
			assert(outer.clicked);
		})();

		// Test events in loop.
		// onclick="this.result = i + car + ':' + j + wheel"
		(function () {
			class EV5 extends XElement {
			}

			EV5.html = `
				<div data-loop="letters: letter">
					<span onclick="this.result = letter"></span>					
				</div>`;

			var b = new EV5();
			b.letters = ['A', 'B'];

			// Make sure we rebind events after splice.
			b.letters.splice(0, 1);
			b.shadowRoot.children[0].dispatchEvent(new Event('click'));
			assertEq(b.result, 'B');
		})();

		// Test events in double loop (used to fail)
		// onclick="this.result = i + car + ':' + j + wheel"
		(function () {
			class EV6 extends XElement {
			}

			EV6.html = `
				<div data-loop="numbers: n, number">
					<div data-loop="letters: l, letter">
						<span onclick="this.result = n + number + ':' + l + letter"></span>
					</div>
				</div>`;

			var b = new EV6();
			b.numbers = ['1', '2'];
			b.letters = ['A', 'B'];

			b.shadowRoot.children[0].children[0].dispatchEvent(new Event('click'));
			assertEq(b.result, '01:0A');

			b.shadowRoot.children[0].children[1].dispatchEvent(new Event('click'));
			assertEq(b.result, '01:1B');

			b.shadowRoot.children[1].children[0].dispatchEvent(new Event('click'));
			assertEq(b.result, '12:0A');

			b.shadowRoot.children[1].children[1].dispatchEvent(new Event('click'));
			assertEq(b.result, '12:1B');

			// Make sure we rebind events after splice.
			b.numbers.splice(0, 1);

			b.shadowRoot.children[0].children[0].dispatchEvent(new Event('click'));
			assertEq(b.result, '02:0A');

			b.shadowRoot.children[0].children[1].dispatchEvent(new Event('click'));
			assertEq(b.result, '02:1B');
		})();

		// Test events in loop.
		(function () {
			class EV7Inner extends XElement {
			}

			EV7Inner.html = `<div onclick="this.val = this.letter"></div>`;

			class EV7Outer extends XElement {
			}

			EV7Outer.html = `
				<div data-loop="letters: letter">
					<x-ev7inner data-prop="letter: letter"></x-ev7inner>					
				</div>`;

			var outer = new EV7Outer();
			outer.letters = ['A', 'B'];

			// Make sure we rebind events after splice.
			var inner = outer.shadowRoot.children;
			inner[0].dispatchEvent(new Event('click'));
			inner[1].dispatchEvent(new Event('click'));

			assert(!outer.val);
			assertEq(inner[0].val, 'A');
			assertEq(inner[1].val, 'B');
		})();
	},

	dataProp: function () {

		(function () {

			// Make sure only the right side of data-prop has replaceVars/addThis applied.
			class Bd1Wheel extends XElement {
			}

			Bd1Wheel.html = `				
			<div>
			    <b data-text="wheel"></b>
			</div>`;

			class Bd1Car extends XElement {
			}

			Bd1Car.html = `				
			<div data-loop="wheels: wheel">
			    <x-bd1wheel data-prop="wheel: wheel"></x-bd1wheel>
			</div>`;

			var c = new Bd1Car();
			c.wheels = [];
			c.wheels.push(1);

			assertEq(c.shadowRoot.children[0].shadowRoot.children[0].textContent, '1');

		})();

		// Watched self-assignment
		(function () {
			class Bd2Wheel extends XElement {
			}

			Bd2Wheel.html = `				
			<div>
			    <b data-text="car.name"></b>
			</div>`;

			class Bd2Car extends XElement {
			}

			Bd2Car.html = `				
			<div>
			    <x-bd2wheel id="wheel" data-prop="car: car"></x-bd2wheel>
			</div>`;

			var c = new Bd2Car();
			c.name = 'Toyota';
			c.car = c; // self assignment.  This used to stack overflow.
		})();

		// Make sure we can share a list between two XElements.  This used to fail.
		(function () {
			class BD3Inner extends XElement {
			}

			BD3Inner.html = `
			<div>
				<div id="loop"  data-loop="items: item">					
					<div></div>
				</div>
			</div>`;


			class BD3Outer extends XElement {
			}

			BD3Outer.html = `
			<div>
				<div id="loop" data-loop="t2.items: item">
					<div></div>
				</div>
				<x-bd3inner id="t2"></x-bd3inner>
			</div>`;

			var t = new BD3Outer();
			t.t2.items = [{name: '1'}];

			assertEq(t.t2.items[0].name, '1');
			assertEq(t.loop.children.length, 1);
			assertEq(t.t2.loop.children.length, 1);
		})();

		// At one point, instantiating T() would cause watchlessSet() to try to overwrite sub,
		// giving a property not writable error.
		(function () {
			class BD4Inner extends XElement {
			}

			BD4Inner.html = `
			<div>
				<div id="loop" data-loop="t1.items: item">					
					<div></div>
				</div>
			</div>`;


			class BD4Outer extends XElement {
			}

			BD4Outer.html = `
			<div>
				<x-bd4inner id="sub" data-prop="t1: this"></x-bd4inner>
			</div>`;

			new BD4Outer();
		})();

		// Bind directly to "this"
		(function () {
			class BD5Inner extends XElement {
			}

			BD5Inner.html = `
				<div>
					<div id="loop" data-loop="t1.items: item">					
						<div data-text="item.name"></div>
					</div>
				</div>`;

			class BD5Outer extends XElement {
			}

			BD5Outer.html = `
				<div>
					<x-bd5inner id="t2" data-prop="t1: this"></x-bd5inner>
				</div>`;

			var t = new BD5Outer();
			t.items = [{name: '1'}];
			assertEq(t.t2.loop.children.length, 1);
		})();


		// Same as above, but loop is used twice.
		// This used to fail because the proxy instead of the original object was being watched the second time.
		(function () {
			class BD6Inner extends XElement {
			}

			BD6Inner.html = `
			<div>
				<div id="loop" data-loop="t1.items: item">					
					<div data-text="item.name"></div>
				</div>
			</div>`;

			class BD6Outer extends XElement {
			}

			BD6Outer.html = `
			<div>
				<div id="loop" data-loop="items: item">					
					<div data-text="item.name"></div>
				</div>
				<x-bd6inner id="t2" data-prop="t1: this"></x-bd6inner>
			</div>`;

			var t = new BD6Outer();
			t.items = [{name: '1'}];

			assertEq(t.t2.loop.children.length, 1);
			assertEq(t.loop.children.length, 1);
		})();

		// Make sure multiple subsribers are updated when an input changes.
		(function () {
			class BD7Inner extends XElement {
			}

			BD7Inner.html = `
			<div>
				<div id="loop" data-loop="t1.items: item">					
					<input data-val="item.name">
				</div>
			</div>`;

			class BD7Outer extends XElement {
			}

			BD7Outer.html = `
			<div>
				<div id="loop" data-loop="items: item">					
					<div data-text="item.name"></div>
				</div>
				<x-bd7inner id="t2" data-prop="t1: this"></x-bd7inner>
			</div>`;

			var t = new BD7Outer();

			t.items = [{name: '1'}];


			t.t2.loop.children[0].value = '2';
			var c = t.t2.loop.children[0];
			c.dispatchEvent(new Event('input'));

			assertEq(t.items[0].name, '2');
			assertEq(t.loop.children[0].textContent, '2');

		})();

		// Three level bind
		(function () {

			class BD8C extends XElement {
			}

			BD8C.html = `				
			<div>
			    <span id="names" data-loop="c.names: name">
			        <div data-text="name"></div>
				</span>
			</div>`;

			class BD8B extends XElement {
			}

			BD8B.html = `				
			<div>
			    <x-bd8c id="xc" data-prop="c: this.b.c"></x-bd8c>
			</div>`;

			class BD8A extends XElement {
			}

			BD8A.html = `				
			<div>
			    <x-bd8b id="xb" data-prop="b: this.a.b"></x-bd8b>
			</div>`;

			var xa = new BD8A();

			var a = {b: {c: {names: [1, 2, 3]}}};
			xa.a = a;

			assertEq(xa.a.$removeProxy, a);
			assertEq(xa.xb.b.$removeProxy, a.b);
			assertEq(xa.xb.xc.c.$removeProxy, a.b.c);
			assertEq(xa.xb.xc.names.children[0].textContent, '1');

		})();


		// Data bind to loop item.
		(function () {

			class BD9B extends XElement {
			}

			BD9B.html = `				
			<div>
			    <span id="nameText" data-text="item.name"></span>
			</div>`;

			class BD9A extends XElement {
			}

			BD9A.html = `				
			<div>
			    <span id="loop" data-loop="a.items: item">
			        <x-bd9b data-prop="item: item"></x-bd9b>
				</span>
			</div>`;

			var xa = new BD9A();
			xa.a = {items: [{name: 1}, {name: 2}]};

			assertEq(xa.loop.children[0].nameText.textContent, '1');
			assertEq(xa.loop.children[1].nameText.textContent, '2');
		})();


		// Double deep loop binding.
		(function () {
			class BD10C extends XElement {
			}

			BD10C.html = `				
			<div>
				<span data-text="wheel"></span>
			</div>`;

			class BD10B extends XElement {
			}

			BD10B.html = `				
			<div>
			    <span id="loop" data-loop="car.wheels: wheel">
			        <x-bd10c data-prop="wheel: wheel"></x-bd10c>
				</span>
			</div>`;

			class BD10A extends XElement {
			}

			BD10A.html = `				
			<div data-loop="cars: car">
				<x-bd10b data-prop="car: car"></x-bd10b>
			</div>`;

			var xa = new BD10A();
			xa.cars = [{wheels: [1]}];


			var bloop = xa.shadowRoot.children[0].loop;
			var c = bloop.children[0];
			assertEq(c.shadowRoot.children[0].textContent, '1');
		})();

		// Double deep loop binding 2
		(function () {

			class BD11Inner extends XElement {
			}

			BD11Inner.html = `				
			<div>
			    <span id="loop" data-loop="car.wheels: wheel">
			        <b data-text="wheel"></b>
				</span>
			</div>`;

			class BD11 extends XElement {
			}

			BD11.html = `				
			<div data-loop="cars: car">
				<x-bd11inner data-prop="car: car"></x-bd11inner>
			</div>`;

			var xa = new BD11();

			window.debug = true;

			// the data-prop gets called on x-b's child template node before x-b#loop can build its children.

			xa.cars = [{wheels: [1, 2]}];

			var loop = xa.shadowRoot.children[0].loop;
			assertEq(loop.children[0].textContent, '1');
			assertEq(loop.children[1].textContent, '2');
			assertEq(loop.children.length, 2);
		})();


		// Ensure props are unsubscribed as items are removed.
		(function () {

			class BD12B extends XElement {
			}

			BD12B.html = `				
			<div>
			    <span id="nameText" data-text="item.name"></span>
			</div>`;

			class BD12A extends XElement {
			}

			BD12A.html = `				
			<div>
			    <span id="loop" data-loop="a.items: item">
			        <x-bd12b data-prop="item: item"></x-bd12b>
				</span>
			</div>`;

			var xa = new BD12A();
			xa.a = {items: [{name: 1}, {name: 2}]};


			xa.a.items.pop();

			var subs = watched.get(xa).subs_;
			assert('"a","items"' in subs);
			assert('"a","items","0"' in subs);
			assertEq(Object.keys(subs).length, 2);

			xa.a.items.pop();
			subs = watched.get(xa).subs_;
			assert('"a","items"' in subs);
			assertEq(Object.keys(subs).length, 1);
		})();

		// Pass prop to an XElement that doesn't bind it or anything else.
		(function () {
			class BD13Inner extends XElement {}
			BD13Inner.html = `<div>hi</div>`;

			class BD13 extends XElement {}
			BD13.html = `
			<div x-loop="nodes: node">
				<x-bd13inner x-prop="xProgram: this"></x-bd13inner>
			</div>`;

			var lb = new BD13();
			lb.nodes = ['A', 'B', 'C'];
		})();


		// Test setting a property from a parent reference.  This used to fail.
		(function () {
			class BD14Inner extends XElement {}
			BD14Inner.html = `
				<div x-loop="parentA.unused: unused">
					<div x-text="parentA.item"></div>
				</div>`;

			class BD14 extends XElement {}
			BD14.html = `
				<div>
					<x-bd14inner id="b" x-prop="parentA: this"></x-bd14inner>
				</div>`;

			var lb = new BD14();

			lb.unused = [1];
			lb.item = 'A';

			//console.log(lb.b.shadowRoot.children[0].textContent);
			assertEq(lb.b.shadowRoot.children[0].textContent, 'A');
		})();

		// Ditto, but with a more complex case.
		(function () {
			class XNode extends XElement {}
			XNode.html = `
				<div>				
					<select x-loop="xProgram.xLadderBuilder.variables: drawerVariable">
						<option x-text="drawerVariable"></option>
					</select>
				</div>`;

			// Below:  Looping over x-loop="xLadderBuilder.program.nodes: node" will work.
			class XProgram extends XElement {}
			XProgram.html = `
				<div>		
					<div id="nodesContainer" x-loop="program.nodes: node">
					    <x-node x-prop="node: node; xProgram: this"></x-node>
					</div>
				</div>`;

			class XLadderBuilder extends XElement {}
			XLadderBuilder.html = `
				<div>
					<div x-loop="variables: i, variable">
						<div x-text="variable"></div>
					</div>
					<x-program id="xProgram" x-prop="xLadderBuilder: this; program: this.program"></x-program>				
				</div>`;

			var lb = new XLadderBuilder();

			lb.variables = ['A', 'B', 'C'];

			lb.program = {
				nodes: [
					{variables: ['A']}
				]
			};
			lb.variables.push('D');

			assertEq(lb.xProgram.nodesContainer.children[0].shadowRoot.children[0].children.length, 4);
			assertEq(lb.xProgram.nodesContainer.children[0].shadowRoot.children[0].children[3].textContent, 'D');
		})();



		// Make sure we don't also bind loop to outer element.  This used to fail.
		(function() {
			class BD15Inner extends XElement {
				constructor() {
					super();
					this.items = [1, 2, 3];
				}
			}

			BD15Inner.html = `
				<div x-loop="items: item">
					<span x-text="item"></span>
				</div>`;

			class BD15 extends XElement {}
			BD15.html = `
				<div>
					<x-bd15inner id="b"></x-bd15inner>				
				</div>`;

			var a = new BD15();
			assertEq(a.b.shadowRoot.children[0].textContent, '1');
		})();



		// Test:  SecondLevelPropForward.
		// Make sure second-level subscriptions are forwarded.
		// This depends on getPropSubscribers() descending from B into C to find that xLadderBuilder is used.
		(function() {

			class C_P16 extends XElement {}
			C_P16.html = `
			<div>
				<span id="text" x-text="parentB.parentA.variable"></span>								
			</div>`;

			class B_P16 extends XElement {}
			B_P16.html = `
			<div>
			    <x-c_p16 id="c" x-prop="parentB: this"></x-c_p16>	
			</div>`;

			class A_P16 extends XElement {}
			A_P16.html = `
			<div>				
				<x-b_p16 id="b" x-prop="parentA: this"></x-b_p16>						
			</div>`;

			var a = new A_P16();
			a.variable = 'A';

			assertEq(a.b.c.text.textContent, 'A');
		})();



		// Test:  ThirdLevelPropForward.
		// Make sure third-level subscriptions are forwarded.
		// This depends on getPropSubscribers() descending from B into C to find that xLadderBuilder is used.
		(function() {

			class D_P17 extends XElement {}
			D_P17.html = `
			<div>
				<span id="text" x-text="parentC.parentB.parentA.variable"></span>								
			</div>`;

			class C_P17 extends XElement {}
			C_P17.html = `
			<div>
			    <x-d_p17 id="d" x-prop="parentC: this"></x-d_p17>
			</div>`;

			class B_P17 extends XElement {}
			B_P17.html = `
			<div>
				<x-c_p17 id="c" x-prop="parentB: this"></x-c_p17>
				<!--<span x-text="parentA.variable"></span>-->
			</div>`;

			class A_P17 extends XElement {}
			A_P17.html = `
			<div>				
				<x-b_p17 id="b" x-prop="parentA: this"></x-b_p17>						
			</div>`;

			var a = new A_P17();
			a.variable = 'A';

			assertEq(a.b.c.d.text.textContent, 'A');
		})();



		// Test:  ThirdLevelPropForwardLoop
		// Same as above, but with a loop to make sure we traverse into the .loopChildren property.
		(function() {

			class D_P18 extends XElement {}
			D_P18.html = `
			<div>
				<span id="text" x-text="parentC.parentB.parentA.variable"></span>								
			</div>`;

			class C_P18 extends XElement {} // [below] parentB.list isn't set until after initialization.
			C_P18.html = `
			<div>
				<div id="loop" x-loop="parentB.parentA.list: unused">
			        <x-d_p18 x-prop="parentC: this"></x-d_p18>
			    </div>
			</div>`;

			class B_P18 extends XElement {}
			B_P18.html = `
			<div>
				<x-c_p18 id="c" x-prop="parentB: this"></x-c_p18>
			</div>`;

			class A_P18 extends XElement {}
			A_P18.html = `
			<div>
				<x-b_p18 id="b" x-prop="parentA: this"></x-b_p18>				
			</div>`;

			var a = new A_P18();
			a.variable = 'A';
			a.list = [1];

			assertEq(a.b.c.loop.children[0].text.textContent, 'A');
		})();
	},













/*

	// Doesn't work, events don't trigger sortable.
	sortable: function() {

		(function() {


			class A extends XElement{}
			A.html = `
				<div>
					<div id="list1" x-loop="items: item" x-sortable>
						<p data-text="item"></p>
					</div>	
					<div id="list2" x-loop="items: item">
						<p data-text="item"></p>
					</div>	
				</div>`;

			let a = new A();

			a.items = ['A', 'B', 'C'];

			document.body.appendChild(a);

			console.log(a.shadowRoot.innerHTML);


			const createBubbledEvent = (type, props = {}) => {
				const event = new Event(type, { bubbles: true });
				Object.assign(event, props);
				return event;
			};

			const startingNode = a.list1;
			const endingNode = a.list1;
			startingNode.dispatchEvent(
				createBubbledEvent("dragstart", { clientX: 0, clientY: 0 })
			);
			endingNode.dispatchEvent(
				createBubbledEvent("drop", { clientX: 10, clientY: 1 })
			);


			console.log(a.items);
			console.log(a.shadowRoot.innerHTML);

		})();
	},


	sortable2: function() {

		(function() {
			class D extends XElement{}
			D.html = `
				<div>
					<div id="list" x-loop="parentC.parentB.parentA.items: item">
						<p data-text="item"></p>
					</div>	
				</div>`;

			class C extends XElement{}
			C.html = `
				<div>
					<x-d x-prop="parentC: this"></x-d>
				</div>`;

			class B extends XElement{}
			B.html = `
				<div>
					<x-c x-prop="parentB: this"></x-c>
				</div>`;

			class A extends XElement{}
			A.html = `
				<div>
					<div id="list" x-loop="items: item" x-sortable>
						<p data-text="item"></p>
					</div>
					<x-b x-prop="parentA: this"></x-b>
				</div>`;

			let a = new A();

			a.items = ['A', 'B', 'C'];

			document.body.appendChild(a);

		})();
	},









	redraw_benchmark: function() {
		// Test how many times text redraw happens.
		// When we shift off the first element, element 2 becomes 1, 3, becomes 2, and so on.
		// Make sure data-prop doesn't cause the whole subscribed loop to rebuilt each time, leading to 100s of unnecessary updates.
		window.count = 0;

		window.passthrough = function(item) {
			if (window.debug2)
				window.count++;
			return item;
		};

		class B extends XElement{}
		B.html = `
			<div x-loop="a.items: item">
				<span x-text="item + passthrough('')"></span>			
			</div>`;

		class A extends XElement{}
		A.html = `
			<div>
				<x-b x-prop="a: this"></x-b>		
			</div>`;

		var a = new A();
		//document.body.appendChild(a);
		a.items = [1, 2, 3];

		window.count = 0;
		window.debug2 = true;

		//XElement.batch(function() {
			a.items.shift();
		//})();
		console.log(window.count);
	},


	redraw_benchmark2: function() {
		window.count = 0;

		window.passthrough = function(item) {
			if (window.init) {
				//console.log(item);
				window.count++;
			}
			return ''
		};

		class B extends XElement{}
		B.html = `
			<div x-loop="a.items: item">
				<span x-text="item + passthrough(item)"></span>			
			</div>`;

		class A extends XElement{}
		A.html = `
			<div>
				<x-b x-prop="a: this"></x-b>		
			</div>`;

		var a = new A();
		//document.body.appendChild(a);
		a.items = [0, 1, 2, 3, 4, 5, 6, 7];

		window.count = 0;
		window.init = true;

		a.items[0] = '1b';
		console.log(window.count);
	},

	redraw_benchmark2B: function() {
		window.count = 0;

		window.passthrough = function(item) {
			if (window.init) {
				console.log(item);
				window.count++;
			}
			return ''
		};


		class A extends XElement{}
		A.html = `
			<div>
				<div id="loop" x-loop="items: item">
					<span x-text="item + passthrough(item)"></span>			
				</div>
			</div>`;

		var a = new A();
		//document.body.appendChild(a);
		a.items = [0, 1, 2, 3, 4, 5, 6, 7];

		window.count = 0;
		window.init = true;

		a.items[0] = '1b';
		console.log(window.count);
		console.log(a.loop.innerHTML);
	},


	temp: function() {
		let code = 'nop(item)';
		let paths = parseVars(code);
		console.log(paths);
	},





	// I made this copy to later test removing the <div x-loop="program.functions: func">.
	temp2: function() {

		class XNode extends XElement {}
		XNode.html = `
			<div>
				<select x-loop="xRung.xFunc.xProgram.xLadderBuilder.variables: v">
					<option x-text="v"></option>
				</select>
			</div>`;

		class XRung extends XElement {}
		XRung.html = `
			<div>
				<x-node x-prop="xRung: this"></x-node>				
			</div>`;

		class XFunc extends XElement {}
		XFunc.html = `
			<div>
			    <x-rung x-prop="rung: func.rungs[0]; xFunc: this"></x-rung>				
			</div>`;

		class XProgram extends XElement {}
		XProgram.html = `
			<div>
				<!-- Deleting this x-loop div makes it fail. -->
				<x-func x-prop="func: program.functions[0]; xProgram: this"></x-func>					
			</div>`;

		class XLadderBuilder extends XElement {

			constructor() {
				super();
				this.variables = ['A', 'B', 'C'];

				this.program =  {
					functions: [
						{
							rungs: [
								{
									nodes: [1]
								}
							]
						}
					],
					rungs: [
						{
							nodes: [1]
						}
					],
					nodes: [1]
				};

				//this.xVariableDrawer.variables.push('D');
			}

		}
		XLadderBuilder.html = `
			<div>
				<x-program id="xProgram" x-prop="xLadderBuilder: this; program: this.program"></x-program>				
			</div>`;

		var lb = new XLadderBuilder();
		document.body.appendChild(lb);
	},

*/
};

