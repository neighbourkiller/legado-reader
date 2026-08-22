import { ref } from 'vue';
const COMMON_CANDIDATE_FONTS = [
    // Windows 常用中文字体
    'Microsoft YaHei',
    'SimSun',
    'SimHei',
    'KaiTi',
    'FangSong',
    'NSimSun',
    'STSong',
    'STKaiti',
    'STFangsong',
    'STHeiti',
    'STZhongsong',
    'STHupo',
    'STXingkai',
    'FZShuTi',
    'FZYaoTi',
    // macOS / iOS 常用中文字体
    'PingFang SC',
    'Hiragino Sans GB',
    'Songti SC',
    'Kaiti SC',
    'Yuanti SC',
    'Heiti SC',
    'Lantinghei SC',
    'Weibei SC',
    'Xingkai SC',
    // 开源 / 优质阅读字体
    'Source Han Sans SC',
    'Source Han Serif SC',
    'Noto Sans CJK SC',
    'Noto Serif CJK SC',
    'LXGW WenKai',
    'LXGW WenKai Screen',
    'WenQuanYi Micro Hei',
    'WenQuanYi Zen Hei',
    // 优质英文字体
    'Georgia',
    'Garamond',
    'Times New Roman',
    'Palatino',
    'Book Antiqua',
    'Cambria',
    'Charter',
    'Baskerville',
    'Merriweather',
    'Roboto',
    'Helvetica Neue',
    'Arial',
];
// Canvas 指纹检测字体是否真实安装
function isFontInstalled(fontName) {
    if (typeof document === 'undefined')
        return false;
    // 优先使用 document.fonts.check
    try {
        if (document.fonts && typeof document.fonts.check === 'function') {
            if (document.fonts.check(`16px "${fontName}"`)) {
                return true;
            }
        }
    }
    catch {
        // 忽略异常，降级到 canvas 宽度对比
    }
    // Canvas 宽度对比法
    try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context)
            return false;
        const testString = 'mmmmmmmmmmlli中文字体测试12345';
        const baseFonts = ['monospace', 'sans-serif', 'serif'];
        for (const baseFont of baseFonts) {
            context.font = `72px ${baseFont}`;
            const baseWidth = context.measureText(testString).width;
            context.font = `72px "${fontName}", ${baseFont}`;
            const testWidth = context.measureText(testString).width;
            if (testWidth !== baseWidth) {
                return true;
            }
        }
    }
    catch {
        return false;
    }
    return false;
}
export function useSystemFonts() {
    const systemFonts = ref([]);
    const isLoading = ref(false);
    const isNativeSupported = ref(typeof window !== 'undefined' && 'queryLocalFonts' in window);
    async function loadFonts() {
        if (systemFonts.value.length > 0) {
            return systemFonts.value;
        }
        isLoading.value = true;
        try {
            // 1. 尝试使用浏览器原生的 Local Font Access API
            if (typeof window !== 'undefined' && 'queryLocalFonts' in window) {
                try {
                    const fontDataList = await window.queryLocalFonts();
                    const familySet = new Set();
                    for (const font of fontDataList) {
                        const family = font.family?.trim();
                        // 过滤竖排字体 (@开头) 以及空名称
                        if (family && !family.startsWith('@')) {
                            familySet.add(family);
                        }
                    }
                    if (familySet.size > 0) {
                        systemFonts.value = Array.from(familySet).sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
                        return systemFonts.value;
                    }
                }
                catch (nativeErr) {
                    console.warn('Native queryLocalFonts 权限被拒绝或失败，启动探测降级方案', nativeErr);
                }
            }
            // 2. 降级方案：探测系统安装的候选字体
            const detected = new Set();
            for (const fontName of COMMON_CANDIDATE_FONTS) {
                if (isFontInstalled(fontName)) {
                    detected.add(fontName);
                }
            }
            systemFonts.value = Array.from(detected).sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
            return systemFonts.value;
        }
        finally {
            isLoading.value = false;
        }
    }
    return {
        systemFonts,
        isLoading,
        isNativeSupported,
        loadFonts,
    };
}
