export function ThemeScript() {
  const script = `
(function(){
  try {
    var stored = localStorage.getItem('mjdital-theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
