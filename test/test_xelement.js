
var test_ParseVar = {

	parseVars: function() {
		var result = parseVars("this.cats[0]+':'+item");
		// TODO
	},

	replaceVar: function() {

		// Make sure indices work with brackets and other stuff.
		var result = replaceVars("this.cats[0]+':'+item", {"item": "this.items[0]"});
		assertEq(result, "this.cats[0]+':'+this.items[0]");

		// Make sure indices are correct when there are function calls.
		result = replaceVars("this.b.functionCall() + item", {"item": "this.items[0]"});
		assertEq(result, "this.b.functionCall() + this.items[0]");

		// Test replacing multiple vars of different lengths:
		result = replaceVars(" cat + item", {"item": "this.items[0]", "cat": "this.cats[0]"});
		assertEq(result, " this.cats[0] + this.items[0]");
	}
};

var test_Watch = {

	init: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		wp.subscribe(['a'], (action, path, value) => {});
		assertEq(o.a.length, 2);
		assertEq(o.a[0], 0);
		assertEq(o.a[1], 1);
	},

	pop: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		wp.subscribe(['a', 0], (action, path, value) => {});
		wp.subscribe(['a', 1], (action, path, value) => {});

		console.log(wp.subs_);
		o.a.pop();

		console.log(wp.subs_); // doesn't remove the watch.  But I think that's correct behavior.

	},


	arrayShift: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var ops = [];
		wp.subscribe(['a'], function(action, path, value) {
			ops.push(Array.from(arguments));
		});

		o.a.shift(); // remove the 0 from the beginning.

		assertEq(o.a.length, 1);
		assertEq(o.a[0], 1);

		assertEq(JSON.stringify(ops[0]), '["set",["a","0"],1]');
		assertEq(JSON.stringify(ops[1]), '["delete",["a","1"]]');
	},

	unsubscribe: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var ops = [];
		var callback = function(action, path, value) {
			ops.push(Array.from(arguments));
		};
		wp.subscribe(['a'], callback);
		assertEq(Object.keys(wp.subs_).length, 1);

		wp.unsubscribe(['a'], callback);
		assertEq(Object.keys(wp.subs_).length, 0);


		wp.subscribe(['a', 0], callback);
		assertEq(Object.keys(wp.subs_).length, 1);
		wp.unsubscribe(['a', 0], callback);
		assertEq(Object.keys(wp.subs_).length, 0);
	}
};

var test_XElement = {



	ids: function() {
		class P1 extends XElement {}
		P1.html = '<div><span id="s"></span></div>'; // attr must be lowercase.

		// Make sure attribute is set from html.
		var p = new P1();
		//p.s = 2; // disallow
		//console.log(p.s);

		// TODO: Test duplicate id's.
	},

	attributes: function() {
		class A extends XElement {}
		A.html = '<div title="val1"></div>';

		// Make sure attribute is set from html.
		var a = new A();
		assertEq(a.getAttribute('title'), 'val1');

		// Overriding attribute.
		var div = document.createElement('div');
		div.innerHTML = '<x-a title="val2">';
		//document.body.appendChild(div);
		assertEq(div.children[0].getAttribute('title'), 'val2');


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

	properties: function() {
		class P1 extends XElement {}
		P1.html = '<div invalidattr="val1"></div>'; // attr must be lowercase.

		// Make sure attribute is set from html.
		var p = new P1();
		assert(!p.hasAttribute('invalidattr'));
		assertEq(p.invalidattr, 'val1');
	},



	embed: function() {
		class E1 extends XElement {}
		E1.html = '<div title="E1">E1</div>';

		var e1 = new E1();
		assertEq(e1.shadowRoot.innerHTML, 'E1');

		class E2 extends XElement {} // e2 wraps e1
		E2.html = '<div><x-e1 title="E2">E1</x-e1></div>';

		var e2 = new E2();
		assertEq(e2.shadowRoot.innerHTML, '<x-e1 title="E2">E1</x-e1>');
	},


	slot: function() {
		class S1 extends XElement {}
		S1.html = '<div><b><slot>Fallback</slot></b></div>';

		var div = document.createElement('div');
		div.innerHTML = '<x-s1>Hello</x-s1>';

		// Make sure element is placed inside slot.
		assertEq(div.innerHTML, '<x-s1>Hello</x-s1>');
		assertEq(div.childNodes[0].shadowRoot.innerHTML, '<b><slot>Fallback</slot></b>');
	},


	slot2: function() {
		class S2 extends XElement {}
		S2.html = '<div><i><slot name="f1" id="f1">f1</slot></i><u><slot name="f2" id="f2">f2</slot></u></div>';

		var div = document.createElement('div');
		div.innerHTML = '<x-s2><b slot="f1">Hello</b><s slot="f2">Goodbye</s></x-s2>';
		var s2 = div.childNodes[0];
		//document.body.append(div); // for visual inspection

		assertEq(s2.shadowRoot.children[0].children[0].assignedNodes()[0].outerHTML, '<b slot="f1">Hello</b>');
		assertEq(s2.shadowRoot.children[1].children[0].assignedNodes()[0].outerHTML,'<s slot="f2">Goodbye</s>');

	},

	bind: function() {
		// Regular attribute
		(function () {
			class B1 extends XElement {}
			B1.html = '<div><span id="span" data-title="titleProp">Text</span></div>';
			var b = new B1();

			b.titleProp = 'val1';
			assertEq(b.span.getAttribute('title'), 'val1');
		})();

		// Bind to sub-property
		(function () {
			class B1 extends XElement {}
			B1.html = '<div><span data-title="span[0].titleProp">Text</span></div>';
			var b = new B1();

			// Ensure the span was created as an array.
			assertEq(b.span.length, 1);
			assertEq(b.span[0].titleProp, undefined); // We make a way to the property but we don't create it.
			assertEq(b.shadowRoot.children[0].getAttribute('title'), null); // prop doesn't exist yet.

			// Set the prop
			b.span[0].titleProp = 'val1';
			assertEq(b.shadowRoot.children[0].getAttribute('title'), 'val1');

			// Set the prop
			b.span[0] = {titleProp: 'val2'};
			assertEq(b.shadowRoot.children[0].getAttribute('title'), 'val2');

			// Set the prop
			b.span = [{titleProp: 'val3'}];
			assertEq(b.shadowRoot.children[0].getAttribute('title'), 'val3');
		})();

		// data-html bind
		(function () {
			class B2 extends XElement {}
			B2.html = '<div><span data-html="spanHtml">Text</span></div>';

			var b = new B2();
			let html = 'some <b>bold</b> text';
			b.spanHtml = html;
			assertEq(b.shadowRoot.children[0].innerHTML, html);
		})();

		// data-text bind
		(function () {
			class B3 extends XElement {}
			B3.html = '<div><span data-text="spanHtml">Text</span></div>';

			var b = new B3();
			let text = 'some <b>bold</b> text';
			b.spanHtml = text;
			assertEq(b.shadowRoot.children[0].textContent, text);
		})();
	},

	bindVal: function() {
		// data-val bind input
		(function() {
			class BV1 extends XElement {}
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
		(function() {
			class BV2 extends XElement {}
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
		(function() {
			class BV3 extends XElement {}
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

	bindLoop: function() {
		// Simple loop
		(function () {
			class BL1 extends XElement {}
			BL1.html =
				'<div data-loop="items:item">' +
					'<span data-text="item"></span>' +
				'</div>';

			var b = new BL1();
			b.items = [1, 2];
			//document.body.appendChild(b);
			assertEq(b.shadowRoot.innerHTML, '<span data-text="item">1</span><span data-text="item">2</span>');

			var wp = watched.get(b);
			console.log(wp.subs_);

			b.items.pop();
			//assertEq(b.shadowRoot.innerHTML, '<span data-text="item">1</span>');

			// b.items.pop();
			// assertEq(b.shadowRoot.innerHTML, '');
			//
			// b.items.push(3);
			// assertEq(b.shadowRoot.innerHTML, '<span data-text="item">3</span>');
			//
			// b.items[0] = 4;
			// assertEq(b.shadowRoot.innerHTML, '<span data-text="item">4</span>');
		})();

		// Loop with sub-properties, whitespace around nodes
		(function () {
			class BL2 extends XElement {}
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
			class BL3 extends XElement {}
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

			//assertEq(b.shadowRoot.innerHTML, '<span data-text="item.a">1</span><span data-text="item.a">2</span>');
		})();

		// Nested loop
		(function () {
			class BL3 extends XElement {}
			BL3.html =
				'<div data-loop="items:item">' +
					'<div data-loop="cats:cat">' +
						'<span data-text="cat+\':\'+item">Hi</span>' +
					'</div>' +
				'</div>';

			var b = new BL3();
			b.items = [1, 2];
			b.cats = [1, 2];
			assertEq(b.shadowRoot.innerHTML,
				'<div data-loop="cats:cat">' +
					'<span data-text="cat+\':\'+item">1:1</span>' +
					'<span data-text="cat+\':\'+item">2:1</span>' +
				'</div>' +
				'<div data-loop="cats:cat">' +
					'<span data-text="cat+\':\'+item">1:2</span>' +
					'<span data-text="cat+\':\'+item">2:2</span>' +
				'</div>');

			b.items.pop();
			assertEq(b.shadowRoot.innerHTML,
				'<div data-loop="cats:cat">' +
					'<span data-text="cat+\':\'+item">1:1</span>' +
					'<span data-text="cat+\':\'+item">2:1</span>' +
				'</div>');

			b.cats.push(3);
			assertEq(b.shadowRoot.innerHTML,
				'<div data-loop="cats:cat">' +
					'<span data-text="cat+\':\'+item">1:1</span>' +
					'<span data-text="cat+\':\'+item">2:1</span>' +
					'<span data-text="cat+\':\'+item">3:1</span>' +
				'</div>');
		})();

		// Loop on nested XElement with val binding.
		(function () {
			class BL4 extends XElement {}
			BL4.html =
				'<div>' +
					'<div data-loop="items:item" id="loop">' +
						'<input data-val="item.val"/>' +
					'</div>' +
				'</div>';

			class BL5 extends XElement {}
			BL5.html = `
				<div>
					<x-bl4 id="bl4"></x-bl4>
				</div>`;

			var bl5 = new BL5();
			var bl4 = bl5.bl4;
			bl4.items = [{val: 1}, {val:2}];
			assertEq(bl4.loop.children[0].value, '1');
			assertEq(bl4.loop.children[1].value, '2');

			bl4.loop.children[1].value = '3';
			bl4.loop.children[1].dispatchEvent(new Event('input'));
			assertEq(bl4.items[1].val, '3');
		})();

		// Make sure items within loop are unbound and unwatched.
		(function() {
			class BL5 extends XElement {}
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
			//assert(!watched.get(v)); // The object will be removed from teh watched weakmap if it has no subscribers.
		})();
	},

	bindLoop2: function() {
		// Test splice
		class BL6 extends XElement {}
		BL6.html = `
			<div>
				<div id="loop" data-loop="items: item">
					<input data-val="item.name">					
				</div>
			</div>`;

		var v = new BL6();
		v.items = [ // This tests uses sub-properties to trigger possible undefiend defererencing.
			{name: 'A'},
			{name: 'B'},
			{name: 'C'}
		];
		
		v.items.splice(1, 1); // remove B.

		assertEq(v.loop.children.length, 2);
	},



	events:  function() {
		(function () {
			class EV1 extends XElement {
				click(e) {
					this.itWorked = e;
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
			assert(e.itWorked instanceof Event);
			///assertEq(e.itWorked.target, e.bt1); // fails!

			e.bt2.dispatchEvent(new Event('click'));
			assert(e.itWorked2);

			e.bt3.dispatchEvent(new Event('click'));
			assert(e.itWorked3);

			e.bt4.dispatchEvent(new Event('click'));
			assert(e.itWorked4);
		})();
	}


};