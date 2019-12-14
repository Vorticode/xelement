
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
			wp.subscribe(['a'], (action, path, value) => {});
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
			assert(!b.items.removeProxy[0].isProxy);
		})();

		// Two watchers of the same array, make sure changing it through one path notifies the other.
		(function() {
			var b = [1, 2, 3];
			var ops = [];

			var b1 = watchObj(b, function(action, path, value) {
				ops.push('b1');
			});
			var b2 = watchObj(b, function(action, path, value) {
				ops.push('b2');
			});

			b2[0] = 5;

			assertEq(ops.length, 2);
			assertEq(ops[0], 'b1');
			assertEq(ops[1], 'b2');
		})();
	},

	pop: function() {

		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		wp.subscribe(['a', 0], (action, path, value) => {});
		wp.subscribe(['a', 1], (action, path, value) => {});

		assert(wp.subs_);
		o.a.pop();

		assert(wp.subs_); // doesn't remove the watch.  But I think that's correct behavior.
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
		var cb = ()=>{};
		wp.subscribe(['a'], cb);
		assertEq(Object.keys(wp.subs_).length, 1);

		wp.unsubscribe(['a'], cb);
		assertEq(Object.keys(wp.subs_).length, 0);


		wp.subscribe(['a', 0], cb);
		assertEq(Object.keys(wp.subs_).length, 1);
		wp.unsubscribe(['a', 0], cb);
		assertEq(Object.keys(wp.subs_).length, 0);
	},

	unsubscribe2: function() {
		// Make sure unsubscribing a child leaves the parent.  This used to fail.
		var o = { a: [0, 1] };
		var wp = new WatchProperties(o);
		var cb = ()=>{};

		wp.subscribe(['a'], cb);
		wp.subscribe(['a', '0'], cb);

		// Unsubscribe one callback from a[0]
		wp.unsubscribe(['a', '0'], cb);
		assert(o.a.isProxy);

		// Unsubscribe all callbacks from a[0]
		wp.unsubscribe(['a', '0']);
		assert(o.a.isProxy);

		// Unsubscribe last callbacks from a.
		wp.unsubscribe(['a'], cb);
		assert(!o.a.isProxy);

		// Make sure we can subscribe back again.
		wp.subscribe(['a'], cb);
		assert(o.a.isProxy);

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
		(function() {
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
			B1.html = '<div><span id="span" data-attribs="title: titleProp">Text</span></div>';
			var b = new B1();

			b.titleProp = 'val1';
			assertEq(b.span.getAttribute('title'), 'val1');
		})();

		// Bind to sub-property
		(function () {
			class B1 extends XElement {}
			B1.html = '<div><span data-attribs="title: span[0].titleProp">Text</span></div>';
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

		// Make sure unbinding one element doesn't unsubscribe() other watches.
		(function() {
			class B5 extends XElement {}
			B5.html =
				'<div>' +
					'<span data-text="item.name"></span>' +
					'<p data-text="item.name"></p>' +
				'</div>';
			var b = new B5();
			b.item = {name: 1};

			assert(b.item.isProxy);
			unbindEl(b, b.shadowRoot.children[1]);
			assert(b.item.isProxy);
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

	classes: function() {

		(function() {
			class C1 extends XElement {}
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
		(function() {
			class C1 extends XElement {}
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

		// Test splice
		(function() {
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
		})();


		// Reassign whole loop variable multiple times to make sure we don't lose the subscription.
		(function() {
			class BL7 extends XElement {}
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
		(function() {
			class BL8 extends XElement {}
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
		(function() {
			class BL9 extends XElement {}
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
			class BL10 extends XElement {}
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

			class BL11 extends XElement {}
			BL11.html = `				
				<div data-loop="parts.wheels: wheel">
				    <span></span>
				</div>`;

			var p = new BL11();
			p.parts = undefined; // TypeError is caught.  Can't evaluate code of loop.
		})();

		// Async
		(function() {
			class Wheel12 extends XElement {}
			Wheel12.html = `				
			<div>
			    <b>Wheel</b>
			</div>`;

			class Car12 extends XElement {}
			Car12.html = `				
			<div data-loop="wheels: wheel">
			    <x-wheel12 data-attribs="title: wheel"></x-wheel12>
			</div>`;
			var c = new Car12();
			c.wheels = [];
			c.wheels.push(1);
			setTimeout(function() {
				c.wheels.push(1);

				// This used to fail when done asynchronously, back when we used connectedCallback()
				assert(c.shadowRoot.children[1].shadowRoot);
			}, 10);
		})();



		// Splice to rearrange loop with identical items
		(function () {class BL1 extends XElement {}

			class BL13 extends XElement {}
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


		// TODO: Test loop over non-simple var.
	},

	bindNestedLoop: function() {

		// Nested loop over two separate properties
		(function() {

			class BL30 extends XElement {}
			BL30.html =
				'<div data-loop="items:item">' +
				'<div data-loop="cats:cat">' +
				'<span data-text="cat+\':\'+item">Hi</span>' +
				'</div>' +
				'</div>';

			var b = new BL30();
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

			// Since this removes all children, it will convert cats back to a regular field instead of a defined property.
			// But it should convert it back to a proxy when rebuildChildren() is called.
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

		// Nested loop over sub properties.
		(function() {
			class BL31 extends XElement {}
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

		// Nexted loop with index.
		(function() {
			class BL32 extends XElement {}
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

		// Nexted loop with duplicate loopVar.
		(function() {
			class BL33 extends XElement {}
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

		// Nexted loop with duplicate index.
		(function() {
			class BL34 extends XElement {}
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

		// Make sure events can access the loop context.
		(function() {
			class EV2 extends XElement {}
			EV2.html = `
				<div data-loop="items: i, item">
					<span onclick="this.result = i + item"></span>
				</div>`;

			var b = new EV2();
			b.items = ['A', 'B'];

			b.shadowRoot.children[0].dispatchEvent(new Event('click'));
			assertEq(b.result, '0A');
		})();

		// Event attribute on definition and instantiation:
		(function() {
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
		(function() {
			class EV4Inner extends XElement {}
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

	},

	bindData: function() {

		(function () {

			// Make sure only the right side of data-bind has replaceVars/addThis applied.
			class Bd1Wheel extends XElement {}
			Bd1Wheel.html = `				
			<div>
			    <b data-text="wheel"></b>
			</div>`;

			class Bd1Car extends XElement {}
			Bd1Car.html = `				
			<div data-loop="wheels: wheel">
			    <x-bd1wheel data-bind="wheel: wheel"></x-bd1wheel>
			</div>`;

			var c = new Bd1Car();
			c.wheels = [];
			c.wheels.push(1);

			assertEq(c.shadowRoot.children[0].shadowRoot.children[0].textContent, '1');

		})();

		// Watched self-assignment
		(function () {
			class Bd2Wheel extends XElement {}
			Bd2Wheel.html = `				
			<div>
			    <b data-text="car.name"></b>
			</div>`;

			class Bd2Car extends XElement {}
			Bd2Car.html = `				
			<div>
			    <x-bd2wheel id="wheel" data-bind="car: car"></x-bd2wheel>
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
				<x-bd4inner id="sub" data-bind="t1: this"></x-bd4inner>
			</div>`;

			var t = new BD4Outer();
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
					<x-bd5inner id="t2" data-bind="t1: this"></x-bd5inner>
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
				<x-bd6inner id="t2" data-bind="t1: this"></x-bd6inner>
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
				<x-bd7inner id="t2" data-bind="t1: this"></x-bd7inner>
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
			    <x-bd8c id="xc" data-bind="c: this.b.c"></x-bd8c>
			</div>`;

			class BD8A extends XElement {
			}

			BD8A.html = `				
			<div>
			    <x-bd8b id="xb" data-bind="b: this.a.b"></x-bd8b>
			</div>`;

			var xa = new BD8A();

			var a = {b: {c: {names: [1, 2, 3]}}};
			xa.a = a;

			assertEq(xa.a.removeProxy, a);
			assertEq(xa.xb.b.removeProxy, a.b);
			assertEq(xa.xb.xc.c.removeProxy, a.b.c);
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
			        <x-bd9b data-bind="item: item"></x-bd9b>
				</span>
			</div>`;

			var xa = new BD9A();
			xa.a = {items: [{name: 1}, {name: 2}]};


			assertEq(xa.loop.children[0].nameText.textContent, '1');
			assertEq(xa.loop.children[1].nameText.textContent, '2');

		})();
	},






	// TODO: Make these into tests.
	failures: function() {

		// Watches with roots on both an object and it's sub-property.
		(function() {


			var a = {
				b1: {
					c: 1,
					parent: undefined
				},
				b2: [1, 2]
			};
			a.b1.parent = a;

			var cb1 = function(action, path, value) {
				console.log('a.b2', path);
			};
			watch(a, ['b2'], cb1);

			var cb2 = function(action, path, value) {
				console.log('b1.parent.b2', path);
			};
			watch(a.b1, ['parent', 'b2'], cb2);


			var item = a.b1.parent.b2;
			item[0] = 5;


		})();

	},

	failures2: function() {

		// Simpler version of failure above:
		(function() {

			var a = {
				b1: {parent: undefined},
				b2: [1, 2]
			};
			a.b1.parent = a;

			var aW = watchObj(a, (action, path, value) => {
				console.log('aW', path);
			});

			var bW = watchObj(a.b1, (action, path, value) => {
				console.log('bW', path);
			});

			// Trigger proxies to be created via get, just in case that's needed.
			var v = aW.b1.parent.b2[0];
			v = bW.parent;
			v = v.b2[0];

			//aW.b2[0] = 5;
			var b2 = bW.parent.b2;
			b2[0] = 5; // prints bW only if aW doesn't exist.


		})();

	},
};