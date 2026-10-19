/* Appearance only: never rebuild mounted reports, editors or the conversation. */
const COLOR_THEMES = new Set(['system','light','dark','dracula']);
function applyTheme(){
 if(!COLOR_THEMES.has(S.theme)) S.theme='system';
 document.documentElement.dataset.theme=S.theme;
 $('#sTheme').value=S.theme;
}
function wireTheme(){
 $('#sTheme').onchange=()=>{S.theme=$('#sTheme').value;saveSettings();};
}
