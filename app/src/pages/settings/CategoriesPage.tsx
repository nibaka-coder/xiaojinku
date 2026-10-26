import Categories from '@/pages/Categories'
import SubPage from './SubPage'

export default function CategoriesPage() {
  return (
    <SubPage title="分类管理">
      <section className="card">
        <Categories />
      </section>
    </SubPage>
  )
}
