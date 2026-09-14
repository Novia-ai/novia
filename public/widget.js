(function () {
  var scriptTag = document.currentScript;
  if (!scriptTag) return;

  var clientKey = scriptTag.getAttribute('data-client');
  if (!clientKey) {
    console.error('NovIA widget: attribut data-client manquant sur la balise <script>.');
    return;
  }

  var origin = new URL(scriptTag.src, window.location.href).origin;

  var style = document.createElement('style');
  style.textContent =
    '.novia-bubble{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;z-index:2147483000;overflow:hidden;' +
    'background:#3b4256;border:none;padding:0;}' +
    '.novia-bubble img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.novia-frame{position:fixed;bottom:90px;right:20px;width:360px;height:520px;max-width:calc(100vw - 40px);' +
    'max-height:calc(100vh - 120px);border:none;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);' +
    'z-index:2147483000;display:none;background:#fff;}' +
    '.novia-frame.novia-open{display:block;}';
  document.head.appendChild(style);

  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'novia-bubble';
  bubble.setAttribute('aria-label', 'Ouvrir le chat NovIA');

  var img = document.createElement('img');
  img.src = origin + '/images/capybara-logo.png';
  img.alt = 'NovIA';
  bubble.appendChild(img);

  var frame = document.createElement('iframe');
  frame.className = 'novia-frame';
  frame.src = origin + '/widget/frame/' + encodeURIComponent(clientKey);
  frame.title = 'Assistant NovIA';

  bubble.addEventListener('click', function () {
    frame.classList.toggle('novia-open');
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(bubble);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();
