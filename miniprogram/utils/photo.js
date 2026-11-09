const { call } = require('./api');

const promisify = (fn) => (opts = {}) => new Promise((resolve, reject) => fn(Object.assign({}, opts, { success: resolve, fail: reject })));
const chooseMedia = promisify(wx.chooseMedia);
const compressImage = promisify(wx.compressImage);
const getImageInfo = promisify(wx.getImageInfo);

// 选图（拍照或相册）。用户取消时返回 null
async function choosePhoto() {
  try {
    const res = await chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], sizeType: ['compressed'] });
    return res.tempFiles[0].tempFilePath;
  } catch (e) {
    return null;
  }
}

// 压缩 → 上传云存储 → 调用识别
async function recognizePhoto(path) {
  let filePath = path;
  try { filePath = (await compressImage({ src: path, quality: 70, compressedWidth: 1280 })).tempFilePath; } catch (e) { /* 压缩失败就用原图 */ }
  const info = await getImageInfo({ src: filePath });
  const ext = /\.png$/i.test(filePath) ? 'png' : 'jpg';
  const cloudPath = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath });
  return call('recognize', { fileID, imageWidth: info.width, imageHeight: info.height });
}

module.exports = { choosePhoto, recognizePhoto };
