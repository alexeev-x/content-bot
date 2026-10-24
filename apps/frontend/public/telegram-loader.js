// Loads telegram-web-app.js only when the page runs inside Telegram, so a normal browser never waits for
// telegram.org. It is a classic script that document.write()s the SDK: the SDK then runs before the app's module
// script, which reads window.Telegram.WebApp.initData for sign-in. Kept as a file because the CSP forbids inline scripts.
(function () {
  var inTelegram = false;
  try {
    inTelegram =
      /[#&]tgWebApp/.test(window.location.hash) ||
      window.sessionStorage.getItem('__telegram__initParams') !== null ||
      typeof window.TelegramWebviewProxy !== 'undefined' ||
      window.parent !== window;
  } catch {
    inTelegram = window.parent !== window;
  }
  if (inTelegram) document.write('<script src="https://telegram.org/js/telegram-web-app.js"></script>');
})();
