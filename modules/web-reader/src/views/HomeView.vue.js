import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useBookshelfStore } from '@/stores/bookshelf';
const router = useRouter();
const bookshelfStore = useBookshelfStore();
const handleFileChange = async (uploadFile) => {
    const file = uploadFile.raw;
    if (!file)
        return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'txt' && ext !== 'epub') {
        ElMessage.error('仅支持 TXT 和 EPUB 格式的文件');
        return;
    }
    const loading = ElMessage({
        message: '正在导入书籍...',
        type: 'info',
        duration: 0
    });
    try {
        await bookshelfStore.parseAndImportBook(file);
        loading.close();
        ElMessage.success('导入成功');
        router.push('/bookshelf');
    }
    catch (error) {
        loading.close();
        ElMessage.error('导入失败，请重试');
        console.error(error);
    }
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "home-container" },
});
/** @type {__VLS_StyleScopedClasses['home-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "upload-area" },
});
/** @type {__VLS_StyleScopedClasses['upload-area']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.elUpload | typeof __VLS_components.ElUpload | typeof __VLS_components['el-upload'] | typeof __VLS_components.elUpload | typeof __VLS_components.ElUpload | typeof __VLS_components['el-upload']} */
elUpload;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ class: "upload-dropzone" },
    drag: true,
    action: "",
    autoUpload: (false),
    onChange: (__VLS_ctx.handleFileChange),
    showFileList: (false),
    accept: ".txt,.epub",
}));
const __VLS_2 = __VLS_1({
    ...{ class: "upload-dropzone" },
    drag: true,
    action: "",
    autoUpload: (false),
    onChange: (__VLS_ctx.handleFileChange),
    showFileList: (false),
    accept: ".txt,.epub",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['upload-dropzone']} */ ;
const { default: __VLS_5 } = __VLS_3.slots;
let __VLS_6;
/** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
elIcon;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    ...{ class: "el-icon--upload" },
}));
const __VLS_8 = __VLS_7({
    ...{ class: "el-icon--upload" },
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
/** @type {__VLS_StyleScopedClasses['el-icon--upload']} */ ;
const { default: __VLS_11 } = __VLS_9.slots;
let __VLS_12;
/** @ts-ignore @type { | typeof __VLS_components.uploadFilled | typeof __VLS_components.UploadFilled | typeof __VLS_components['upload-filled']} */
uploadFilled;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
// @ts-ignore
[handleFileChange,];
var __VLS_9;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "el-upload__text" },
});
/** @type {__VLS_StyleScopedClasses['el-upload__text']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
{
    const { tip: __VLS_17 } = __VLS_3.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "el-upload__tip" },
    });
    /** @type {__VLS_StyleScopedClasses['el-upload__tip']} */ ;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
