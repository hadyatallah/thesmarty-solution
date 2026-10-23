// Hash navigation supports links, refresh and Back/Forward; no-JS keeps all sections readable.
(() => {
 const panels=[...document.querySelectorAll('[data-hub-panel]')];if(!panels.length)return;
 const apply=()=>{
  const [requested,topic='all']=location.hash.slice(1).split('/');
  const section=['articles','partners','resources'].includes(requested)?requested:'articles';
  const validTopics=[...document.querySelectorAll('[data-topic-link]')].map(a=>a.dataset.topicLink);
  const selectedTopic=validTopics.includes(topic)?topic:'all';
  panels.forEach(p=>{p.hidden=p.dataset.hubPanel!==section;});
  document.querySelectorAll('[data-hub-tab]').forEach(a=>{if(a.dataset.hubTab===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.querySelectorAll('[data-topic-link]').forEach(a=>{if(a.dataset.topicLink===selectedTopic)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const articles=[...document.querySelectorAll('#articles [data-topic]')];articles.forEach(c=>{c.hidden=selectedTopic!=='all'&&c.dataset.topic!==selectedTopic;});
  const status=document.querySelector('.hub-status');if(status)status.textContent=section==='articles'?`${articles.filter(c=>!c.hidden).length} articles shown`:`${section==='partners'?'Partners':'Useful Resources'} section shown`;
 };
 document.querySelector('.skip')?.addEventListener('click',event=>{event.preventDefault();const main=document.querySelector('main');main.tabIndex=-1;main.focus();main.scrollIntoView();});
 window.addEventListener('hashchange',apply);apply();
})();
