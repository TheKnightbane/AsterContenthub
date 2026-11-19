export const palettes = {
  lime: { accent:'#d5f69b', background:'#0c121c', surface:'#111b29', raised:'#172332', sidebar:'#080e18', text:'#edf3e8', muted:'#97aa96' },
  ice: { accent:'#9bd9ff', background:'#091521', surface:'#102334', raised:'#173147', sidebar:'#07121e', text:'#e7f4ff', muted:'#94b0c6' },
  violet: { accent:'#c5afff', background:'#15101f', surface:'#21182f', raised:'#30213f', sidebar:'#100b19', text:'#f1eaff', muted:'#b2a0c8' }
} as const;
export function applyTheme(accent:keyof typeof palettes){
  const p=palettes[accent];const root=document.documentElement;
  root.dataset.asterTheme=accent;
  for(const [name,value]of Object.entries({ '--lime':p.accent,'--theme-bg':p.background,'--theme-surface':p.surface,'--theme-raised':p.raised,'--theme-sidebar':p.sidebar,'--theme-text':p.text,'--theme-muted':p.muted,'--theme-accent':p.accent }))root.style.setProperty(name,value);
}
