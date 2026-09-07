export interface Project {
  year: string;
  tag: string;
  title: string;
  desc: string;
  /** 视差深度 0.6~1.4 */
  depth: number;
  image?: string;
  /** 富文本：每行一个块，行首是标签则原样使用，否则包成 <p> */
  content?: string;
}

export const PROJECTS: Project[] = [
  {
    year: "2024.03",
    tag: "Diary",
    title: "初春的第一场花雨",
    desc: "樱花树下的午后，风一吹整条街都在下粉色的雪。记录一段慢下来的时光。",
    depth: 1.2,
    image: "https://images.pexels.com/photos/33594696/pexels-photo-33594696.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    content: `<h2>花雨</h2>
那天没有带伞，也没有目的地。
走到河边的时候，风忽然大起来，整棵树的花瓣一起离开枝头，像一场没有预告的雪。
我站在原地，没有躲。
<h2>河边的长椅</h2>
长椅上的老爷爷在给鸽子讲故事，鸽子听得很认真，我也听得很认真。
他说这棵树比他年纪还大，每年都是第一个开、最后一个谢。
<h3>记下的几件小事</h3>
<ul><li>便利店买的草莓牛奶，比想象中甜</li><li>老爷爷的帽子上落了三片花瓣，他没有发现</li><li>河面上漂着的花瓣会打转，像在犹豫要不要走</li></ul>
<img src="https://images.pexels.com/photos/13167952/pexels-photo-13167952.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200" alt="樱花特写">
<h2>回家的路</h2>
天快黑的时候才想起来要回家。
路灯一盏一盏亮起来，花瓣在灯光下变成了淡淡的橙色。
回家路上发现鞋带上停了一片花瓣，就让它一路跟着我回来了。
<h3>没有拍下来的</h3>
有些画面按快门的时候就知道拍不出来：风的方向、牛奶的温度、老爷爷说话的停顿。
所以干脆没有拍，写在这里。
<hr>
<h2>尾声</h2>
<p><em>“花开的时候不用着急，反正它一定会落。”</em></p>
所以慢慢走就好。`
  },
  {
    year: "2024.04",
    tag: "Photo",
    title: "晴空与粉色",
    desc: "把相机举向天空的瞬间，蓝和粉刚好各占一半。",
    depth: 0.8,
    image: "https://images.pexels.com/photos/36542675/pexels-photo-36542675.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200"
  },
  {
    year: "2024.05",
    tag: "Essay",
    title: "关于玻璃罐的小实验",
    desc: "一支樱花枝、一个玻璃罐、一周的时间。看它能坚持多久。",
    depth: 1.4,
    image: "https://images.pexels.com/photos/6906614/pexels-photo-6906614.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    content: `<h2>玻璃罐里的一周</h2>
一支樱花枝、一个玻璃罐、一周的时间。每天早上写一句。
<h3>Day 1 — 入水</h3>
剪下一枝，放进清水。花苞紧闭，像是不太情愿。
罐子放在窗边，阳光斜斜地照进来一半。
<h3>Day 3 — 初开</h3>
早上醒来，三朵开了。房间里有一点若有若无的甜味。
换了一次水，顺便把罐子转了个方向，让另一面也晒到。
<h3>Day 5 — 全开</h3>
全开。桌子上落了第一片花瓣，我没有扫。
<img src="https://images.pexels.com/photos/31420487/pexels-photo-31420487.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200" alt="阴天的樱花">
<h3>Day 7 — 只剩枝</h3>
只剩枝。但水还是清的，我又插了一枝进去。
<hr>
<h2>结论</h2>
<ol><li>换水比想象中重要</li><li>不要放在空调正下方</li><li>凋谢也很好看，不用急着丢</li></ol>
<p><em>下周再来一次。</em></p>`
  },
  {
    year: "2024.06",
    tag: "Diary",
    title: "阴天也要出门",
    desc: "云层压得很低，花却开得更亮了。原来颜色不需要阳光也能说话。",
    depth: 1.0,
    image: "https://images.pexels.com/photos/31420487/pexels-photo-31420487.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200"
  },
  {
    year: "2024.08",
    tag: "Travel",
    title: "去看最后一棵晚樱",
    desc: "坐了两小时电车，只为确认它今年还在。它在。",
    depth: 0.7,
    image: "https://images.pexels.com/photos/31930576/pexels-photo-31930576.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    content: `<h3>两小时电车</h3>
车厢里几乎没有人。窗外的田地从绿变成更深的绿。
我一直在想：如果它今年没有开呢？
<hr>
下车、走十五分钟、拐过一个弯——
它在。而且比记忆里更大一圈。
<img src="https://images.pexels.com/photos/31930576/pexels-photo-31930576.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200" alt="盛放的樱花">
<p>回程的时候买了一个铜锣烧，在站台上吃完了。</p>
<p><em>值得。</em></p>`
  },
  {
    year: "2024.10",
    tag: "Note",
    title: "整理胶片",
    desc: "翻出去年春天没冲的三卷胶片，把它们送去了店里。",
    depth: 1.1
  },
  {
    year: "2025.01",
    tag: "Diary",
    title: "新年的第一张照片",
    desc: "天空很蓝，树枝很静。把去年冲出来的照片贴在了墙上。",
    depth: 0.9,
    image: "https://images.pexels.com/photos/32381801/pexels-photo-32381801.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200"
  },
  {
    year: "2025.03",
    tag: "Diary",
    title: "又是一年",
    desc: "又到了整条街下粉色雪的季节。这次带了伞，但没有撑开。",
    depth: 1.3,
    image: "https://images.pexels.com/photos/12029153/pexels-photo-12029153.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    content: `<h3>又是一年</h3>
去年的那棵树还在，长椅上的老爷爷也还在。
鸽子好像换了一批，但也可能是我认不出来。
<hr>
<h4>今年的小事</h4>
<ul><li>草莓牛奶换了包装，味道没变</li><li>给树拍了一张跟去年同角度的照片</li><li>回家路上，鞋带上又停了一片花瓣</li></ul>
<img src="https://images.pexels.com/photos/12029153/pexels-photo-12029153.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200" alt="盛开的樱花树">
<p>有些事情不需要变。</p>`
  }
];
