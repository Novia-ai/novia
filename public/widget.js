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
    'background:#3b4256;border:none;padding:0;animation:novia-shake 4s ease-in-out infinite;}' +
    '.novia-bubble.novia-bubble-opened{animation:none;}' +
    '.novia-bubble.novia-halo{box-shadow:0 0 0 2px rgba(255,209,102,.35),0 4px 14px rgba(0,0,0,.25);' +
    'animation:novia-shake 4s ease-in-out infinite,novia-halo 3s ease-out infinite;}' +
    '.novia-bubble.novia-halo.novia-bubble-opened{animation:none;}' +
    '.novia-bubble img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.novia-frame{position:fixed;bottom:90px;right:20px;width:360px;height:520px;max-width:calc(100vw - 40px);' +
    'max-height:calc(100vh - 120px);border:none;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);' +
    'z-index:2147483000;display:none;background:#fff;}' +
    '.novia-frame.novia-open{display:block;}' +
    '@keyframes novia-shake{0%,100%{transform:rotate(0deg) scale(1);}2%{transform:rotate(-10deg) scale(1.05);}' +
    '4%{transform:rotate(10deg) scale(1.05);}6%{transform:rotate(-8deg) scale(1.05);}' +
    '8%{transform:rotate(8deg) scale(1.05);}10%{transform:rotate(0deg) scale(1);}}' +
    '@keyframes novia-halo{0%{box-shadow:0 0 0 2px rgba(255,209,102,.35),0 0 4px 2px rgba(255,209,102,.4),0 4px 14px rgba(0,0,0,.25);}' +
    '100%{box-shadow:0 0 0 2px rgba(255,209,102,.35),0 0 24px 32px rgba(255,209,102,0),0 4px 14px rgba(0,0,0,.25);}}';
  document.head.appendChild(style);

  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'novia-bubble';
  bubble.setAttribute('aria-label', 'Ouvrir le chat NovIA');
  // Sur le site de NovIA lui-même : un halo jaune qui pulse, pour attirer l'œil vers la démo
  if (window.location.origin === origin) bubble.classList.add('novia-halo');

  var img = document.createElement('img');
  img.src = origin + '/widget/logo/' + encodeURIComponent(clientKey);
  img.alt = 'NovIA';
  bubble.appendChild(img);

  var frame = document.createElement('iframe');
  frame.className = 'novia-frame';
  frame.src = origin + '/widget/frame/' + encodeURIComponent(clientKey);
  frame.title = 'Assistant NovIA';

  bubble.addEventListener('click', function () {
    frame.classList.toggle('novia-open');
    bubble.classList.add('novia-bubble-opened');
  });

  window.addEventListener('message', function (event) {
    if (event.data && event.data.noviaAction === 'close') {
      frame.classList.remove('novia-open');
    }
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
