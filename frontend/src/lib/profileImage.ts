const CLOUDINARY_UPLOAD_SEGMENT = '/upload/';

const normalizeUrl = (value?: string) => String(value || '').trim();

export const getProfileImageUrl = (rawUrl?: string, size = 160): string => {
  const source = normalizeUrl(rawUrl);
  if (!source) return '';

  // Optimize Cloudinary avatars for sharp, consistent circular crops.
  if (source.includes('res.cloudinary.com') && source.includes(CLOUDINARY_UPLOAD_SEGMENT)) {
    const transform = `f_auto,q_auto,c_fill,g_face,w_${size},h_${size}`;
    return source.replace(CLOUDINARY_UPLOAD_SEGMENT, `${CLOUDINARY_UPLOAD_SEGMENT}${transform}/`);
  }

  return source;
};