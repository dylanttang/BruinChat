import * as ImagePicker from 'expo-image-picker';
import { MAX_RECORDING_SECONDS } from './mediaPolicy';

// `quality` controls photos. Videos need their own export/recording settings.
// iOS exports library videos as compatible H.264/AAC MP4s before returning assets.
export const LIBRARY_MEDIA_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images', 'videos'],
  allowsMultipleSelection: true,
  selectionLimit: 10,
  orderedSelection: true,
  quality: 0.85,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
};

export const CAMERA_MEDIA_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images', 'videos'],
  quality: 0.85,
  videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  videoMaxDuration: MAX_RECORDING_SECONDS,
};
