// Retailers enter navigation only after their complete source and image acceptance.
export const RETAILER_ACTIVATION={mt:false,bq:false,nx:true,jl:true};
export const retailerEnabled=id=>RETAILER_ACTIVATION[id]!==false;
