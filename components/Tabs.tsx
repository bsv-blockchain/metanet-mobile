import bookmarkStore from '@/stores/BookmarkStore'; // Updated import path
import { Bookmark } from '@/shared/types/browser'; // Import Bookmark type
import { View } from 'react-native';

const Tabs = () => {
  return (
    <>
      {bookmarkStore.bookmarks.map((bookmark: Bookmark, index: number) => (
        // Render logic here - using bookmark.url as an example
        <View key={index}>{bookmark.url}</View>
      ))}
    </>
  );
};

export default Tabs;
