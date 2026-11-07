import * as ImagePicker from 'expo-image-picker';
import { MAX_RECORDING_SECONDS } from './mediaPolicy';

// Photo `quality` does not compress videos; request a compatible 720p iOS export.
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
