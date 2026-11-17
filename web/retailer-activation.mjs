// Retailers enter navigation only after their complete source and image acceptance.
export const RETAILER_ACTIVATION={nx:false,jl:false};
export const retailerEnabled=id=>RETAILER_ACTIVATION[id]!==false;
