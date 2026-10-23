(() => {
  const s = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  s('panel-selected-tab', 'network');
  s('cache-disabled', true);
  s('screencast-enabled', false);
  s('disable-locale-info-bar', true);
  s('network-log-show-overview', false);
  for (const k of ['network-resource-type-filters', 'network-resource-type-filter', 'networkResourceTypeFilters']) s(k, { font: true });
  s('network-log-columns', {name:{visible:true},status:{visible:false},protocol:{visible:true},type:{visible:false},initiator:{visible:false},size:{visible:true},time:{visible:false},'response-header-content-type':{visible:true},'response-header-content-encoding':{visible:true},waterfall:{visible:false}});
  location.reload();
  return 'set';
})()
