// Chân dung nhân vật ở public/characters/<characterId>.png, cắt bằng
// scripts/import-character-art.sh. Nhân vật không có trong bảng nào dưới đây sẽ rơi về
// mặt bài chữ (CardTextFace) thay vì một ô trống, nên bảng được phép chậm hơn roster.

// Người có chân dung RIÊNG. 16 nhân vật bộ gốc.
export const CHARACTER_PHOTO_IDS = [
  "bart-cassidy",
  "black-jack",
  "calamity-janet",
  "el-gringo",
  "jesse-jones",
  "jourdonnais",
  "kit-carlson",
  "lucky-duke",
  "paul-regret",
  "pedro-ramirez",
  "rose-doolan",
  "sid-ketchum",
  "slab-the-killer",
  "suzy-lafayette",
  "vulture-sam",
  "willy-the-kid",
];

// 15 nhân vật Dodge City chưa được vẽ, mượn tạm mặt của bộ gốc.
//
// Mượn bằng DỮ LIỆU chứ không nhân bản file: có tranh thật thì xoá một dòng ở đây và
// thả file vào public/characters/, không phải đi dọn ảnh trùng.
//
// Cố định theo id chứ không random mỗi ván: một nhân vật phải luôn cùng một mặt, nếu
// không thì người chơi không thể học cách nhận ra ai.
//
// CHẤP NHẬN ĐÁNH ĐỔI: 31 người trên 16 mặt nên có 15 cặp trùng mặt. Bàn đông thì hai
// người có thể mang cùng một mặt — lúc đó phải đọc TÊN dưới ảnh mới phân biệt được.
// Đây là giá của việc chưa có tranh, không phải thiết kế mong muốn.
export const CHARACTER_PHOTO_BORROWED: Record<string, string> = {
  "pixie-pete": "kit-carlson",
  "sean-mallory": "suzy-lafayette",
  "tequila-joe": "pedro-ramirez",
  "bill-noface": "slab-the-killer",
  "greg-digger": "vulture-sam",
  "herb-hunter": "black-jack",
  "elena-fuente": "calamity-janet",
  "apache-kid": "el-gringo",
  "chuck-wengam": "bart-cassidy",
  "doc-holyday": "willy-the-kid",
  "jose-delgado": "jesse-jones",
  "pat-brennan": "lucky-duke",
  "molly-stark": "rose-doolan",
  "belle-star": "jourdonnais",
  "vera-custer": "paul-regret",
};

export const CHARACTER_PHOTO: Record<string, string> = {
  ...Object.fromEntries(CHARACTER_PHOTO_IDS.map((id) => [id, `/characters/${id}.png`])),
  ...Object.fromEntries(
    Object.entries(CHARACTER_PHOTO_BORROWED).map(([id, from]) => [id, `/characters/${from}.png`]),
  ),
};
