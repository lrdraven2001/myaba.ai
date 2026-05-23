import { useState } from 'react';

export default function SearchView() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <h2 className="text-2xl font-semibold text-gray-800">Search</h2>
      </div>
      <div className="flex-1 flex items-center justify-center flex-col gap-6">
        <h2 className="text-3xl font-semibold text-gray-700">What are you looking for?</h2>
        <div className="flex items-center gap-4">
          <select
            className="border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-teal-400 font-semibold text-gray-600 bg-white"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All</option>
            <option>Clients</option>
            <option>Documents</option>
            <option>Policies</option>
            <option>Templates</option>
          </select>
          <input
            type="text"
            placeholder="Search..."
            className="border-2 border-gray-300 rounded-lg px-6 py-3 w-96 focus:outline-none focus:border-teal-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {query && (
          <p className="text-gray-400 text-sm">
            Searching {filter.toLowerCase()} for "{query}"…
          </p>
        )}
      </div>
    </div>
  );
}
