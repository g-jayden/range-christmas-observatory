// Retailers enter navigation only after their complete source and image acceptance.
export const RETAILER_ACTIVATION={ar:false,mt:true,bq:true,nx:true,jl:true};
export const retailerEnabled=id=>RETAILER_ACTIVATION[id]!==false;
