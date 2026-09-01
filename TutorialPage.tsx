import React, { useEffect, useMemo, useState } from 'react';

type IconName = 'sparkles' | 'canvas' | 'image' | 'workflow' | 'layers' | 'keyboard' | 'server' | 'help' | 'arrow' | 'search' | 'menu' | 'close' | 'check' | 'copy';

const Icon: React.FC<{ name: IconName; className?: string }> = ({ name, className = 'h-5 w-5' }) => {
  const paths: Record<IconName, React.ReactNode> = {
    sparkles: <><path d="m12 3-1.35 3.65L7 8l3.65 1.35L12 13l1.35-3.65L17 8l-3.65-1.35L12 3Z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14Z"/><path d="m19 13-.55 1.45L17 15l1.45.55L19 17l.55-1.45L21 15l-1.45-.55L19 13Z"/></>,
    canvas: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M8 9h13"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h4a4 4 0 0 1 4 4v5M15 13l2 2 2-2"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    keyboard: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h4M6 16h12"/></>,
    server: <><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h7M11 17.5h7"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.7 2c-.9.6-1.4 1-1.4 2M12 17h.01"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  };

  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

const sections = [
  { id: 'start', label: '快速开始', icon: 'sparkles' as IconName, hint: '3 分钟完成第一次生成' },
  { id: 'canvas', label: '认识画布', icon: 'canvas' as IconName, hint: '移动、缩放与选择' },
  { id: 'create', label: 'AI 图片创作', icon: 'image' as IconName, hint: '从素材到生成结果' },
  { id: 'workflow', label: '连续工作流', icon: 'workflow' as IconName, hint: '让输出自动成为输入' },
  { id: 'elements', label: '元素与整理', icon: 'layers' as IconName, hint: '便签、标注与网页' },
  { id: 'shortcuts', label: '快捷操作', icon: 'keyboard' as IconName, hint: '提高画布操作效率' },
  { id: 'deploy', label: '配置与部署', icon: 'server' as IconName, hint: '个人与内网使用' },
  { id: 'faq', label: '常见问题', icon: 'help' as IconName, hint: '遇到问题先看这里' },
];

const stepCards = [
  { number: '01', title: '放入创作素材', text: '拖入一张参考图片，或用左侧工具添加便签、标签和手绘标注。', color: 'from-amber-400 to-orange-500' },
  { number: '02', title: '框选需要的内容', text: '拖动框选图片和说明文字。它们会一起成为这次生成的上下文。', color: 'from-violet-500 to-fuchsia-500' },
  { number: '03', title: '点击「生成」', text: '选择模型、比例和数量后开始生成，结果会出现在右侧历史记录中。', color: 'from-sky-500 to-cyan-500' },
];

const shortcuts = [
  ['平移画布', '拖动空白处'], ['框选元素', '空白处拖出选框'], ['多选元素', 'Shift + 点击'],
  ['复制', 'Ctrl / ⌘ + C'], ['粘贴', 'Ctrl / ⌘ + V'], ['删除', 'Delete / Backspace'],
  ['撤销', 'Ctrl / ⌘ + Z'], ['重做', 'Ctrl / ⌘ + Shift + Z'], ['快速便签', '双击空白处'],
];

const faqItems = [
  ['为什么选中图片后没有出现「生成」按钮？', '需要至少选中一个画布元素。按住鼠标从空白处拖出选框，或按住 Shift 逐个点击元素。网页元素还需要先启用为 AI 来源。'],
  ['生成后的图片在哪里？', '生成任务和结果都在右侧的「生成记录」面板。你可以把满意的结果重新添加到画布，继续标注和迭代。'],
  ['删除的内容还能恢复吗？', '可以。普通删除会先进入左侧工具栏的回收站，在永久删除前都能恢复。'],
  ['同事使用时需要知道 API Key 吗？', '不需要。内网部署时把密钥放在服务器的 .env 中，浏览器只会看到允许选择的模型名称。'],
];

const CodeBlock: React.FC<{ children: string }> = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl shadow-slate-950/10">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400"/><span className="h-2.5 w-2.5 rounded-full bg-amber-400"/><span className="h-2.5 w-2.5 rounded-full bg-emerald-400"/></div>
        <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-white">
          <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />{copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 text-[13px] leading-6 text-slate-300"><code>{children}</code></pre>
    </div>
  );
};

const SectionTitle: React.FC<{ eyebrow: string; title: string; description: string; dark?: boolean }> = ({ eyebrow, title, description, dark = false }) => (
  <div className="mb-8 max-w-3xl">
    <p className={`mb-2 text-xs font-bold uppercase tracking-[0.22em] ${dark ? 'text-violet-300' : 'text-violet-600'}`}>{eyebrow}</p>
    <h2 className={`text-3xl font-black tracking-tight sm:text-4xl ${dark ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
    <p className={`mt-3 text-base leading-7 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{description}</p>
  </div>
);

const Tutorial: React.FC = () => {
  const [activeId, setActiveId] = useState('start');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const oldTitle = document.title;
    document.title = '使用教程 · Banana Canvas';
    const nodes = sections.map(section => document.getElementById(section.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveId(visible.target.id);
    }, { rootMargin: '-15% 0px -68% 0px', threshold: [0, 0.2, 0.6] });
    nodes.forEach(node => observer.observe(node));
    return () => { observer.disconnect(); document.title = oldTitle; };
  }, []);

  const searchResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return sections.filter(item => `${item.label}${item.hint}`.toLowerCase().includes(keyword));
  }, [query]);

  const navigate = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
    setMenuOpen(false);
    setQuery('');
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#f7f7fb] font-sans text-slate-800 selection:bg-violet-200">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="返回 Banana Canvas">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-lg shadow-violet-500/25">🍌</span>
            <span className="font-black tracking-tight text-slate-900">Banana Canvas</span>
            <span className="hidden rounded-md bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-600 sm:inline">教程</span>
          </a>
          <div className="relative ml-auto hidden w-full max-w-md md:block">
            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索教程，例如：工作流、快捷键…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100" />
            {query && (
              <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                {searchResults.length ? searchResults.map(item => (
                  <button key={item.id} onClick={() => navigate(item.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-violet-50">
                    <Icon name={item.icon} className="h-4 w-4 text-violet-600"/><span><span className="block text-sm font-bold">{item.label}</span><span className="block text-xs text-slate-500">{item.hint}</span></span>
                  </button>
                )) : <p className="px-3 py-4 text-center text-sm text-slate-500">没有找到相关章节</p>}
              </div>
            )}
          </div>
          <a href="/" className="hidden items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-violet-600 sm:inline-flex">打开画布 <Icon name="arrow" className="h-4 w-4"/></a>
          <button onClick={() => setMenuOpen(!menuOpen)} className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white lg:hidden" aria-label="打开目录"><Icon name={menuOpen ? 'close' : 'menu'}/></button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-auto border-b border-slate-200 bg-white p-4 shadow-2xl lg:hidden">
          {sections.map(item => <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${activeId === item.id ? 'bg-violet-50 text-violet-700' : 'text-slate-600'}`}><Icon name={item.icon} className="h-5 w-5"/><span className="font-bold">{item.label}</span></button>)}
        </div>
      )}

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-r border-slate-200/80 bg-white/40 px-5 py-8 lg:block">
          <p className="mb-3 px-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">教程目录</p>
          <nav className="space-y-1">
            {sections.map(item => (
              <button key={item.id} onClick={() => navigate(item.id)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${activeId === item.id ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/80 hover:text-slate-900'}`}>
                <Icon name={item.icon} className={`h-5 w-5 ${activeId === item.id ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600'}`}/>
                <span className="text-sm font-bold">{item.label}</span>
                {activeId === item.id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-500"/>}
              </button>
            ))}
          </nav>
          <div className="absolute bottom-8 left-5 right-5 rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-sm font-bold">边看边动手</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">教程会在新页面打开，你的画布内容仍会自动保存。</p>
            <a href="/" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-300 hover:text-white">返回画布 <Icon name="arrow" className="h-3.5 w-3.5"/></a>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden">
          <section id="start" className="scroll-mt-24 px-5 pb-20 pt-14 sm:px-10 sm:pt-20 xl:px-16">
            <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-12 text-white shadow-2xl shadow-violet-950/20 sm:px-12 sm:py-16">
              <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-violet-600/35 blur-3xl"/>
              <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl"/>
              <div className="relative max-w-3xl">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-violet-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> 从零开始 · 无需设计基础</div>
                <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">把灵感放上画布，<br/><span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">让 AI 帮你继续创作。</span></h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Banana Canvas 把参考图、文字要求、手绘标注和生成结果放在同一个无限画布里。先完成下面三步，你就掌握了最核心的使用方法。</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={() => document.getElementById('first-generation')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-violet-100">开始第一次创作 <Icon name="arrow" className="h-4 w-4"/></button>
                  <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">直接打开画布</a>
                </div>
              </div>
              <div className="relative mt-12 grid grid-cols-3 gap-3 border-t border-white/10 pt-7 sm:max-w-xl">
                {[['01','导入素材'],['02','框选内容'],['03','生成图片']].map(([n, label]) => <div key={n}><p className="text-xs font-black text-violet-300">{n}</p><p className="mt-1 text-xs font-bold text-slate-300 sm:text-sm">{label}</p></div>)}
              </div>
            </div>

            <div id="first-generation" className="scroll-mt-24 pt-20">
              <SectionTitle eyebrow="Quick start" title="第一次生成，只需要三步" description="你不需要先理解所有按钮。把素材放进来、框选它、点击生成，就能立即看到结果。"/>
              <div className="grid gap-5 md:grid-cols-3">
                {stepCards.map(card => <article key={card.number} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${card.color}`}/><span className="font-mono text-xs font-bold text-slate-400">STEP {card.number}</span><h3 className="mt-8 text-xl font-black text-slate-900">{card.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{card.text}</p></article>)}
              </div>
              <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><span className="text-lg">💡</span><p><strong>先从简单指令开始：</strong>例如上传产品图，再添加便签写上“保持主体不变，改为温暖的午后场景”。描述目标比堆砌关键词更有效。</p></div>
            </div>
          </section>

          <section id="canvas" className="scroll-mt-20 border-t border-slate-200 bg-white px-5 py-20 sm:px-10 xl:px-16">
            <SectionTitle eyebrow="01 · Canvas" title="先认识这张无限画布" description="画布没有固定边界。你可以像整理一张超大的桌面一样摆放素材，自由缩放、拖动和分组。"/>
            <div className="grid gap-8 xl:grid-cols-[1.2fr_.8fr]">
              <div className="relative min-h-[430px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-inner" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                <div className="absolute left-5 top-5 w-44 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-black text-slate-800">创作要求</span><span className="h-2 w-2 rounded-full bg-amber-400"/></div><p className="text-[11px] leading-5 text-slate-500">保留包装设计，背景改成夏日海边，清透自然光。</p></div>
                <div className="absolute left-[39%] top-[28%] h-44 w-44 rotate-[-3deg] overflow-hidden rounded-2xl border-4 border-white bg-gradient-to-br from-orange-300 via-amber-100 to-sky-300 shadow-2xl"><div className="absolute bottom-0 h-1/2 w-full bg-sky-400/60"/><div className="absolute left-1/2 top-1/2 h-24 w-16 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-lg"><span className="grid h-full place-items-center text-3xl">🍌</span></div></div>
                <div className="absolute bottom-10 right-8 w-48 rounded-2xl border-2 border-dashed border-violet-500 bg-violet-50/70 p-4"><p className="text-xs font-bold text-violet-700">框选区域</p><p className="mt-1 text-[10px] leading-4 text-violet-600">图片 + 便签会一起发送给 AI</p><div className="absolute -bottom-10 right-0 flex gap-2"><span className="rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-bold text-white shadow-lg">生成</span><span className="rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-bold text-white shadow-lg">编组</span></div></div>
                <div className="absolute bottom-5 left-5 rounded-xl border border-white bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-500 shadow">拖动空白处移动 · 滚轮缩放</div>
              </div>
              <div className="space-y-3">
                {[['移动视野','按住画布空白处拖动；触控板双指移动也可以。'],['缩放画布','使用鼠标滚轮或触控板缩放，素材的位置关系不会改变。'],['选择内容','点击选择单个元素；从空白处拖出选框可一次选择多个元素。'],['编辑元素','拖动元素移动位置，使用边框控制点调整大小或旋转。']].map(([title,text], index) => <div key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-black text-violet-600 shadow-sm">{index+1}</span><div><h3 className="text-sm font-black text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div></div>)}
              </div>
            </div>
          </section>

          <section id="create" className="scroll-mt-20 px-5 py-20 sm:px-10 xl:px-16">
            <SectionTitle eyebrow="02 · Create" title="用选中的内容指导 AI" description="选中的元素就是本次生成的上下文。参考图提供视觉信息，便签、标签和箭头告诉 AI 你希望怎么改。"/>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {[['1','选择模型','从服务器允许的模型中选择；模型不同，速度和画质也不同。'],['2','设置画面','选择 1:1、16:9 等宽高比，以及 1K–4K 分辨率。'],['3','组织指令','把参考图、需求便签、箭头或手绘一起框选。'],['4','管理结果','在生成记录中预览结果，满意后添加回画布继续修改。']].map(([n,title,text]) => <article key={n} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-3xl font-black text-slate-200">{n}</span><h3 className="mt-4 font-black text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}
            </div>
            <div className="mt-8 grid overflow-hidden rounded-3xl border border-slate-200 bg-white lg:grid-cols-2">
              <div className="p-7 sm:p-9"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-600">好指令</p><h3 className="mt-3 text-xl font-black">说清楚“保留什么、改变什么”</h3><p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">“保留瓶身、标签和视角不变，把背景改成清晨的露营桌面。柔和侧光，画面干净，适合作为电商横幅。”</p></div>
              <div className="border-t border-slate-200 bg-slate-50 p-7 sm:p-9 lg:border-l lg:border-t-0"><p className="text-xs font-black uppercase tracking-[.2em] text-rose-500">不够明确</p><h3 className="mt-3 text-xl font-black">只堆叠抽象关键词</h3><p className="mt-4 rounded-xl bg-rose-50 p-4 text-sm leading-7 text-rose-950">“高级、好看、有氛围、电影感、爆款、质感强。”</p><p className="mt-3 text-xs text-slate-500">AI 不知道哪些现有内容必须保留，也不知道最终图片要用在哪里。</p></div>
            </div>
          </section>

          <section id="workflow" className="scroll-mt-20 border-y border-slate-200 bg-slate-950 px-5 py-20 text-white sm:px-10 xl:px-16">
            <SectionTitle dark eyebrow="03 · Workflow" title="把多轮修改串成连续工作流" description="当任务需要反复生成时，把输入和输出编成一组。每次点击开始，新的输出都会接着上一轮继续迭代。"/>
            <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
              {[['A','输入素材','参考图 + 修改说明','border-amber-400/40 bg-amber-400/10'],['B','工作流组','框选后点击「编组」','border-violet-400/40 bg-violet-400/10'],['C','持续迭代','输出自动进入下一轮','border-cyan-400/40 bg-cyan-400/10']].map((item,index) => <React.Fragment key={item[0]}><div className={`rounded-2xl border p-6 ${item[3]}`}><span className="text-xs font-black text-slate-400">{item[0]}</span><h3 className="mt-8 text-xl font-black">{item[1]}</h3><p className="mt-2 text-sm text-slate-300">{item[2]}</p></div>{index<2 && <Icon name="arrow" className="mx-auto h-5 w-5 rotate-90 text-slate-500 lg:rotate-0"/>}</React.Fragment>)}
            </div>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-slate-300"><strong className="text-white">适合：</strong>同一张图连续换背景、逐步优化细节、让一组参考图反复参与生成。调整蓝色组框的大小，就能决定哪些元素属于这个工作流。</div>
          </section>

          <section id="elements" className="scroll-mt-20 bg-white px-5 py-20 sm:px-10 xl:px-16">
            <SectionTitle eyebrow="04 · Elements" title="不只是图片：用不同元素表达意图" description="把视觉素材和文字说明放在一起，AI 才能更准确地理解上下文；这些元素也能帮助你整理项目。"/>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ['🖼️','图片','上传、拖放或粘贴；可作为参考图或下载最终结果。','bg-orange-50'],
                ['📝','便签','写完整的修改要求、创作目标或项目备注。','bg-amber-50'],
                ['🏷️','标签','给素材分类，或用短句标记需要保留的局部。','bg-rose-50'],
                ['↗️','箭头','明确指出说明对应图片的哪个位置。','bg-emerald-50'],
                ['✏️','手绘','直接圈出、涂抹或画出希望修改的区域。','bg-violet-50'],
                ['🌐','网页','嵌入参考页面；启用后可作为 AI 上下文。','bg-sky-50'],
              ].map(([emoji,title,text,bg]) => <article key={title} className="rounded-2xl border border-slate-200 p-5 transition hover:-translate-y-1 hover:shadow-lg"><span className={`grid h-11 w-11 place-items-center rounded-xl text-xl ${bg}`}>{emoji}</span><h3 className="mt-5 font-black text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}
            </div>
          </section>

          <section id="shortcuts" className="scroll-mt-20 border-y border-slate-200 px-5 py-20 sm:px-10 xl:px-16">
            <SectionTitle eyebrow="05 · Shortcuts" title="熟悉这些操作，创作会快很多" description="Windows 使用 Ctrl，macOS 使用 ⌘。复制内容时，单张图片会按图片复制，文字会按文字复制，混合选择会保留视觉布局。"/>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {shortcuts.map(([action,key], index) => <div key={action} className={`flex items-center justify-between gap-6 px-5 py-4 sm:px-6 ${index !== shortcuts.length-1 ? 'border-b border-slate-100' : ''}`}><span className="text-sm font-bold text-slate-700">{action}</span><kbd className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold text-slate-600 shadow-[0_2px_0_#e2e8f0]">{key}</kbd></div>)}
            </div>
          </section>

          <section id="deploy" className="scroll-mt-20 bg-white px-5 py-20 sm:px-10 xl:px-16">
            <SectionTitle eyebrow="06 · Setup" title="个人开发与公司内网部署" description="个人调试可以直接启动 Vite；团队共用时建议由服务器统一保管 API 密钥，同事的浏览器不会接触密钥。"/>
            <div className="grid gap-8 xl:grid-cols-2">
              <div><h3 className="mb-4 text-lg font-black text-slate-900">本地开发</h3><CodeBlock>{`pnpm install\nCopy-Item .env.example .env\npnpm run dev`}</CodeBlock><p className="mt-3 text-sm leading-6 text-slate-500">浏览器访问 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-violet-700">http://localhost:3000</code>。</p></div>
              <div><h3 className="mb-4 text-lg font-black text-slate-900">构建并启动内网服务</h3><CodeBlock>{`pnpm install\npnpm run build\npnpm start`}</CodeBlock><p className="mt-3 text-sm leading-6 text-slate-500">同一内网的其他人访问 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-violet-700">http://服务器IP:3000</code>。</p></div>
            </div>
            <div className="mt-8 rounded-2xl border border-violet-200 bg-violet-50 p-6"><h3 className="font-black text-violet-950">服务器 .env 至少需要这些设置</h3><div className="mt-4 grid gap-2 text-sm text-violet-900 sm:grid-cols-2"><code>AI_PROVIDER</code><code>AI_BASE_URL</code><code>AI_API_KEY</code><code>AI_MODEL / AI_MODELS</code></div><p className="mt-4 text-sm leading-6 text-violet-800">修改配置后需要重启服务。当前应用不包含用户登录，请只放在受信任的内网，或接入公司已有的登录网关。</p></div>
          </section>

          <section id="faq" className="scroll-mt-20 px-5 py-20 sm:px-10 xl:px-16">
            <SectionTitle eyebrow="07 · FAQ" title="常见问题" description="大部分操作问题都可以从选择状态、生成记录和服务器配置这三个地方快速排查。"/>
            <div className="space-y-3">
              {faqItems.map(([question,answer], index) => <details key={question} open={index === 0} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black text-slate-900"><span>{question}</span><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-normal transition group-open:rotate-45">+</span></summary><p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-7 text-slate-600">{answer}</p></details>)}
            </div>
            <div className="mt-12 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-8 text-white shadow-xl sm:flex-row sm:items-center sm:p-10"><div><p className="text-sm font-bold text-violet-100">准备好了吗？</p><h3 className="mt-2 text-2xl font-black sm:text-3xl">打开画布，完成你的第一次创作。</h3></div><a href="/" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-violet-700 shadow-lg transition hover:-translate-y-0.5">进入 Banana Canvas <Icon name="arrow" className="h-4 w-4"/></a></div>
          </section>

          <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-xs text-slate-400">Banana Canvas · AI 图片创作与视觉整理工作台</footer>
        </main>
      </div>
    </div>
  );
};

export default Tutorial;
