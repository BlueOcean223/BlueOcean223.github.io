document.addEventListener('DOMContentLoaded', function () {
    // 获取 APlayer 的实例
    const aplayer = document.querySelector('.aplayer'); // 使用插件生成的 APlayer 元素
    const ap = aplayer && aplayer.__aplayer; // 获取 APlayer 实例

    if (ap) {
        // 添加按钮事件监听
        document.getElementById('prev-btn').addEventListener('click', function () {
            ap.skipBack(); // 切换到上一首
        });

        document.getElementById('next-btn').addEventListener('click', function () {
            ap.skipForward(); // 切换到下一首
        });
    } else {
        console.error('APlayer 实例未找到！请检查播放器是否正确初始化。');
    }
});
