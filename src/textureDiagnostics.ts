export interface TextureFailure { bitmapTagId:number; imageIndex:number; code:string; reason:string }
export function summarizeTextureFailures(items:readonly TextureFailure[]) {
  const groups=new Map<string,number>();
  for(const item of items)groups.set(item.code,(groups.get(item.code)??0)+1);
  const descriptions:Record<string,string>={
    'missing-resource':'need Halo Textures', 'resource-unavailable':'need an available resource file',
    'unsupported-format':'use unsupported pixel formats', 'unsupported-layout':'use unsupported image layouts',
    'resource-mismatch':'do not match the selected resource', 'budget-exceeded':'exceed the preview memory limit',
    'already-assigned':'already have an image', 'verification-failed':'failed verification',
  };
  return [...groups].map(([code,count])=>`${count} ${descriptions[code]??'could not be loaded'}`).join(', ');
}
