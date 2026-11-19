import {createHash} from 'node:crypto';
import {productBody,productDescription} from '../web/taxonomy.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

// A missing photograph must never count as a matching image. Description-only
// review can exclude an out-of-scope SKU, but cannot establish a product class.
export function reviewedTaxonomyOverride(product,override){
 if(!override||override.title!==productBody(product))return null;
 if(sha(override.imageHash)&&override.imageHash===product.imageCacheEvidence?.sha256)return 'source-image-and-exact-SKU-reviewed';
 const detail=product.detailEvidence;
 if(override.disposition==='exclude'&&!override.object&&!override.treeStyle&&override.evidenceMode==='exact-source-description'&&sha(override.detailHash)&&override.detailHash===detail?.sourceContentHash&&detail.verifiedProductSection&&String(detail.selectedSku)===String(product.sku)&&sha(override.descriptionHash)&&override.descriptionHash===digest(productDescription(product)))return 'source-description-and-exact-SKU-reviewed';
 return null;
}
