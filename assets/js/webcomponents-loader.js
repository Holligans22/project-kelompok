/**
 * @lisensi
 * Hak Cipta (c) 2018 Penulis Proyek Polimer. Seluruh hak cipta.
 * Kode ini hanya dapat digunakan di bawah lisensi gaya BSD yang ditemukan di http://polymer.github.io/LICENSE.txt
 * Kumpulan penulis lengkap dapat ditemukan di http://polymer.github.io/AUTHORS.txt
 * Kumpulan kontributor lengkap dapat ditemukan di http://polymer.github.io/CONTRIBUTORS.txt
 * Kode didistribusikan oleh Google sebagai bagian dari proyek polimer juga
 * tunduk pada pemberian hak IP tambahan yang ditemukan di http://polymer.github.io/PATENTS.txt
 */

/** (function () {
  "use strict"; */
  
    /**
     * Aliran dasar dari proses loader
     *
     * Ada 4 aliran yang dapat diambil loader saat melakukan booting
     *
     * - Skrip sinkron, tidak perlu polyfill
     * - tunggu `DOMContentLoaded`
     * - aktifkan acara WCR, karena tidak ada panggilan balik yang diteruskan ke `waitFor`
     *
     * - Skrip sinkron, diperlukan polyfill
     * - document.write bundel polyfill
     * - tunggu peristiwa `memuat` bundel untuk mengelompokkan pemutakhiran Elemen Kustom
     * - tunggu `DOMContentLoaded`
     * - jalankan panggilan balik yang diteruskan ke `waitFor`
     * - tembak acara WCR
     *
     * - Skrip asinkron, tidak perlu polyfill
     * - tunggu `DOMContentLoaded`
     * - jalankan panggilan balik yang diteruskan ke `waitFor`
     * - tembak acara WCR
     *
     * - Skrip asinkron, diperlukan polyfill
     * - Tambahkan skrip bundel polyfill
     * - tunggu event `load` dari bundel
     * - batch Peningkatan Elemen Kustom
     * - jalankan callback yang diteruskan ke `waitFor`
     * - tembak acara WCR
     */
(function () {
  "use strict";

  var polyfillsLoaded = false;
  var whenLoadedFns = [];
  var allowUpgrades = false;
  var flushFn;

  function fireEvent() {
    window.WebComponents.ready = true;
    document.dispatchEvent(new CustomEvent("WebComponentsReady", { bubbles: true }));
  }

  function batchCustomElements() {
    if (window.customElements && customElements.polyfillWrapFlushCallback) {
      customElements.polyfillWrapFlushCallback(function (flushCallback) {
        flushFn = flushCallback;
        if (allowUpgrades) {
          flushFn();
        }
      });
    }
  }

  function asyncReady() {
    batchCustomElements();
    ready();
  }

  function ready() {
    // bootstrap <template> elements before custom elements
    if (window.HTMLTemplateElement && HTMLTemplateElement.bootstrap) {
      HTMLTemplateElement.bootstrap(window.document);
    }
    polyfillsLoaded = true;
    runWhenLoadedFns().then(fireEvent);
  }

  function runWhenLoadedFns() {
    allowUpgrades = false;
    var fnsMap = whenLoadedFns.map(function (fn) {
      return fn instanceof Function ? fn() : fn;
    });
    whenLoadedFns = [];
    return Promise.all(fnsMap)
      .then(function () {
        allowUpgrades = true;
        flushFn && flushFn();
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  window.WebComponents = window.WebComponents || {};
  window.WebComponents.ready = window.WebComponents.ready || false;
  window.WebComponents.waitFor =
    window.WebComponents.waitFor ||
    function (waitFn) {
      if (!waitFn) {
        return;
      }
      whenLoadedFns.push(waitFn);
      if (polyfillsLoaded) {
        runWhenLoadedFns();
      }
    };
  window.WebComponents._batchCustomElements = batchCustomElements;

  var name = "webcomponents-loader.js";
  // Feature detect which polyfill needs to be imported.
  var polyfills = [];
  if (!("attachShadow" in Element.prototype && "getRootNode" in Element.prototype) || (window.ShadyDOM && window.ShadyDOM.force)) {
    polyfills.push("sd");
  }
  if (!window.customElements || window.customElements.forcePolyfill) {
    polyfills.push("ce");
  }

  var needsTemplate = (function () {
    // no real <template> because no `content` property (IE and older browsers)
    var t = document.createElement("template");
    if (!("content" in t)) {
      return true;
    }
    // broken doc fragment (older Edge)
    if (!(t.content.cloneNode() instanceof DocumentFragment)) {
      return true;
    }
    // broken <template> cloning (Edge up to at least version 17)
    var t2 = document.createElement("template");
    t2.content.appendChild(document.createElement("div"));
    t.content.appendChild(t2);
    var clone = t.cloneNode(true);
    return clone.content.childNodes.length === 0 || clone.content.firstChild.content.childNodes.length === 0;
  })();

  // NOTE: any browser that does not have template or ES6 features
  // must load the full suite of polyfills.
  if (!window.Promise || !Array.from || !window.URL || !window.Symbol || needsTemplate) {
    polyfills = ["sd-ce-pf"];
  }

  if (polyfills.length) {
    var url;
    var polyfillFile = "bundles/webcomponents-" + polyfills.join("-") + ".js";

    // Load it from the right place.
    if (window.WebComponents.root) {
      url = window.WebComponents.root + polyfillFile;
    } else {
      var script = document.querySelector('script[src*="' + name + '"]');
      // Load it from the right place.
      url = script.src.replace(name, polyfillFile);
    }

    var newScript = document.createElement("script");
    newScript.src = url;
    // if readyState is 'loading', this script is synchronous
    if (document.readyState === "loading") {
      // make sure custom elements are batched whenever parser gets to the injected script
      newScript.setAttribute("onload", "window.WebComponents._batchCustomElements()");
      document.write(newScript.outerHTML);
      document.addEventListener("DOMContentLoaded", ready);
    } else {
      newScript.addEventListener("load", function () {
        asyncReady();
      });
      newScript.addEventListener("error", function () {
        throw new Error("Could not load polyfill bundle" + url);
      });
      document.head.appendChild(newScript);
    }
  } else {
    // if readyState is 'complete', script is loaded imperatively on a spec-compliant browser, so just fire WCR
    if (document.readyState === "complete") {
      polyfillsLoaded = true;
      fireEvent();
    } else {
      // this script may come between DCL and load, so listen for both, and cancel load listener if DCL fires
      window.addEventListener("load", ready);
      window.addEventListener("DOMContentLoaded", function () {
        window.removeEventListener("load", ready);
        ready();
      });
    }
  }
})();
