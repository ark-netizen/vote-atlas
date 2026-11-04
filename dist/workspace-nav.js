'use strict';
/* Active item selection; do not rebuild the menu when navigating. */
(function(){
 function update(){
  const path=window.location.pathname.split('/').pop()||'index.html';
  const query=new URLSearchParams(window.location.search);
  let selected='overview';
  if(path==='index.html')selected=['list','sources'].includes(query.get('view'))?query.get('view'):'calendar';
  else if(path==='rewards.html')selected='rewards';
  else if(path==='awards.html')selected='awards';
  else if(path==='trend-detail.html')selected='trends';
  else if(path==='overview.html')selected=({'#voteTrends':'trends','#artists':'artists','#sources':'sources'})[window.location.hash]||'overview';
  for(const item of document.querySelectorAll('.workspace-menu-item')){
    const isCurrent=item.dataset.navKey===selected;
    item.classList.toggle('active',isCurrent);
    if(isCurrent)item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  }
 }
 window.VoteAtlasWorkspaceNav={update};
 window.addEventListener('popstate',update);
 window.addEventListener('hashchange',update);
 update();
})();
