document.addEventListener('DOMContentLoaded', function () {
    const ap = new APlayer({
        container: document.getElementById('aplayer-global'), // 播放器容器
        fixed: true, // 是否固定播放器
        listFolded: true, // 播放列表默认折叠
        autoplay: false, // 不自动播放
        theme: '#e6d0b2', // 自定义主题颜色
        listMaxHeight: '513px', // 播放列表最大高度
        audio: [
            {
                name: "三葉のテーマ",
                artist: "RADWIMPS",
                url: "https://blueocean223.github.io/auto-music/music/RADWIMPS - 三葉のテーマ.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "兰亭序",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 兰亭序.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "遂愿",
                artist: "朱心怡",
                url: "https://blueocean223.github.io/auto-music/遂愿.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "倒带",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 倒帶.flac",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "知否知否",
                artist: "胡夏&郁可唯",
                url: "https://blueocean223.github.io/auto-music/music/知否知否.mp3",
                cover: "/img/zfzf.jpg"
            },
            {
                name: "倒数",
                artist: "G.E.M. 邓紫棋",
                url: "https://blueocean223.github.io/auto-music/music/G.E.M. 邓紫棋 - 倒数.mp3",
                cover: "/img/dzq.jpg"
            },
            {
                name: "句号",
                artist: "G.E.M. 邓紫棋",
                url: "https://blueocean223.github.io/auto-music/music/G.E.M. 邓紫棋 - 句号.mp3",
                cover: "/img/dzq.jpg"
            },
            {
                name: "喜欢你",
                artist: "G.E.M. 邓紫棋",
                url: "https://blueocean223.github.io/auto-music/music/G.E.M. 邓紫棋 - 喜欢你.mp3",
                cover: "/img/dzq.jpg"
            },
            {
                name: "泡沫",
                artist: "G.E.M. 邓紫棋",
                url: "https://blueocean223.github.io/auto-music/music/G.E.M. 邓紫棋 - 泡沫.mp3",
                cover: "/img/dzq.jpg"
            },
            {
                name: "多远都要在一起",
                artist: "G.E.M. 邓紫棋",
                url: "https://blueocean223.github.io/auto-music/music/G.E.M.邓紫棋 - 多远都要在一起.mp3",
                cover: "/img/dzq.jpg"
            },
            {
                name: "なんでもないや (movie ver.)",
                artist: "RADWIMPS",
                url: "https://blueocean223.github.io/auto-music/music/RADWIMPS - なんでもないや (movie ver.).mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "スパークル (movie ver.)",
                artist: "RADWIMPS",
                url: "https://blueocean223.github.io/auto-music/music/RADWIMPS - スパークル (movie ver.).mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "前前前世 (movie ver.)",
                artist: "RADWIMPS",
                url: "https://blueocean223.github.io/auto-music/music/RADWIMPS - 前前前世 (movie ver.).mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "梦灯籠",
                artist: "RADWIMPS",
                url: "https://blueocean223.github.io/auto-music/music/RADWIMPS - 夢灯籠.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "なんでもないや (movie ver.)",
                artist: "上白石萌音",
                url: "https://blueocean223.github.io/auto-music/music/上白石萌音 - なんでもないや (movie ver.).mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "你是我的风景",
                artist: "何洁",
                url: "https://blueocean223.github.io/auto-music/music/何洁 - 你是我的风景.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "一路向北",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 一路向北.flac",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "不该",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 不该.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "妳听得到",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 妳听得到.flac",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "安静",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 安静.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "开不了口",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 开不了口.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "搁浅",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 搁浅.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "明明就",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 明明就.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "晴天",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 晴天.flac",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "暗号",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 暗号.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "爱情废柴",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 爱情废柴.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "红尘客栈",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 - 红尘客栈.mp3",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "反方向的鐘",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 反方向的鐘.flac",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "軌跡",
                artist: "周杰伦",
                url: "https://blueocean223.github.io/auto-music/music/周杰伦 軌跡.flac",
                cover: "/img/jaychou.jpg"
            },
            {
                name: "天黑黑",
                artist: "孙燕姿",
                url: "https://blueocean223.github.io/auto-music/music/孙燕姿 - 天黑黑.mp3",
                cover: "/img/syz.jpg"
            },
            {
                name: "开始懂了",
                artist: "孙燕姿",
                url: "https://blueocean223.github.io/auto-music/music/孙燕姿 - 开始懂了.mp3",
                cover: "/img/syz.jpg"
            },
            {
                name: "我怀念的",
                artist: "孙燕姿",
                url: "https://blueocean223.github.io/auto-music/music/孙燕姿 - 我怀念的.mp3",
                cover: "/img/syz.jpg"
            },
            {
                name: "逆光",
                artist: "孙燕姿",
                url: "https://blueocean223.github.io/auto-music/music/孙燕姿 - 逆光.mp3",
                cover: "/img/syz.jpg"
            },
            {
                name: "遇见",
                artist: "孙燕姿",
                url: "https://blueocean223.github.io/auto-music/music/孙燕姿 - 遇见.mp3",
                cover: "/img/syz.jpg"
            },
            {
                name: "雨天",
                artist: "孙燕姿",
                url: "https://blueocean223.github.io/auto-music/music/孙燕姿 - 雨天.mp3",
                cover: "/img/syz.jpg"
            },
            {
                name: "年轮",
                artist: "张碧晨",
                url: "https://blueocean223.github.io/auto-music/music/张碧晨 - 年轮.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "最后一页",
                artist: "江语晨",
                url: "https://blueocean223.github.io/auto-music/music/江语晨 - 最后一页.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "你不知道的事",
                artist: "王力宏",
                url: "https://blueocean223.github.io/auto-music/music/王力宏 - 你不知道的事.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "传奇",
                artist: "王菲",
                url: "https://blueocean223.github.io/auto-music/music/王菲 - 传奇.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "红豆",
                artist: "王菲",
                url: "https://blueocean223.github.io/auto-music/music/王菲 - 红豆.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "这世界那么多人",
                artist: "莫文蔚",
                url: "https://blueocean223.github.io/auto-music/music/莫文蔚 - 这世界那么多人.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "一直很安静",
                artist: "阿桑",
                url: "https://blueocean223.github.io/auto-music/music/阿桑 - 一直很安静.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "富士山下",
                artist: "陈奕迅",
                url: "https://blueocean223.github.io/auto-music/music/陈奕迅 - 富士山下.mp3",
                cover: "https://blueocean223.github.io/auto-music/img/eason.jpg"
            },
            {
                name: "天若有情",
                artist: "黄丽玲",
                url: "https://blueocean223.github.io/auto-music/music/黄丽玲 - 天若有情.mp3",
                cover: "/img/yourname.jpg"
            },
            {
                name: "恶作剧",
                artist: "王蓝茵",
                url: "https://blueocean223.github.io/auto-music/music/王蓝茵 - 恶作剧.flac",
                cover: "/img/yourname.jpg"
            }
        ]
    });
});
