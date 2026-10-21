export function LocaleScript() {
  const script = `
(function(){
  try {
    var match = document.cookie.match(/(?:^|; )mjdital_locale=([^;]*)/);
    var locale = match ? decodeURIComponent(match[1]) : '';
    if (locale !== 'ar' && locale !== 'en') {
      locale = location.pathname.indexOf('/doctor') === 0 ? 'en' : 'ar';
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  } catch (e) {}
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
