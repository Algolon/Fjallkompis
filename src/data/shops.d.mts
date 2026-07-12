import type {
  AssortmentProduct,
  ProductCategory,
  ShopCategory,
  ShopLocation,
  ShopSize,
  ShopType,
  SourceMeta,
} from '../types';

export declare const SHOP_PRICE_REFERENCE_YEAR: number;
export declare const SHOP_FACTS_VERIFIED_ON: string;

export declare const PRODUCT_CATEGORIES: ProductCategory[];
export declare const STF_SHOP_OVERVIEW_SOURCE: SourceMeta;
export declare const STF_LARGE_PRICELIST_URL: string;
export declare const STF_SMALL_PRICELIST_URL: string;

export declare const ASSORTMENT_PRODUCTS: AssortmentProduct[];
export declare const SHOP_LOCATIONS: ShopLocation[];

export interface AssortmentGroup {
  category: ProductCategory;
  products: AssortmentProduct[];
}

export declare function productsForSize(size: ShopSize): AssortmentProduct[];
export declare function assortmentByCategory(size: ShopSize): AssortmentGroup[];
export declare function searchProducts(query: string): AssortmentProduct[];
export declare function assortmentCounts(size: ShopSize): {
  standard: number;
  extra: number;
  total: number;
};
export declare function shopsByType(type: ShopType): ShopLocation[];

export interface ShopCategoryOption {
  id: ShopCategory;
  label: string;
}
export declare const SHOP_CATEGORIES: ShopCategoryOption[];

export interface FullServiceShop {
  id: string;
  name: string;
  note: string;
  source: SourceMeta;
}
export declare const FULL_SERVICE_SHOPS: FullServiceShop[];

export declare function shopTypeForStop(stopId: string): ShopCategory | null;
