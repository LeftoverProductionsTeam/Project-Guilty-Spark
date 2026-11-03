export interface SparkEmblemPicture {version:2;sourceHash:string;tagId:number;resources:string;png:string}
export function validSparkEmblemPicture(value:unknown,sourceHash:string,tagId:number,resources:string):value is SparkEmblemPicture{
  if(!value||typeof value!=='object')return false;
  const picture=value as SparkEmblemPicture;
  return picture.version===2&&/^[a-f0-9]{64}$/i.test(sourceHash)&&picture.sourceHash===sourceHash
    &&picture.tagId===tagId&&picture.resources===resources&&typeof picture.png==='string'
    &&picture.png.startsWith('data:image/png;base64,iVBORw0KGgo')&&picture.png.length<=180000;
}
