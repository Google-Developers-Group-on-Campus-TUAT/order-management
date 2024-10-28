'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import './OrderManagement.css'

// 型定義
interface OrderItem {
  id: number
  item: 'リンゴ' | 'バナナ'
  price: number
  ticketNumber: number
}

interface AvailableTickets {
  [key: string]: number[]
}

const TICKET_COUNT = 10 // 札の総数

export default function OrderManagement() {
  // Stateの型定義
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [tempOrderItems, setTempOrderItems] = useState<OrderItem[]>([])
  const [tempTotal, setTempTotal] = useState<number>(0)
  const [availableTickets, setAvailableTickets] = useState<AvailableTickets>({
    リンゴ: Array.from({ length: TICKET_COUNT }, (_, i) => i + 1),
    バナナ: Array.from({ length: TICKET_COUNT }, (_, i) => i + 1)
  })

  // Supabaseから注文を取得する関数
  const fetchOrdersFromDatabase = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: true })
  
    if (error) {
      console.error('注文の取得に失敗しました:', error.message)
      return []
    }
  
    return data.map((order: any) => ({
      id: order.id,
      item: order.item,
      price: order.price,
      ticketNumber: order.ticket_number
    }))
  }
  
  useEffect(() => {
    // 初期注文の読み込み
    const loadInitialOrders = async () => {
      const orders = await fetchOrdersFromDatabase()
      if (orders) {
        setOrderItems(orders)
        updateAvailableTickets(orders)
      }
    }
    loadInitialOrders()

    // リアルタイムリスナーの設定
    const channel = supabase
      .channel('orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        const updatedOrders = await fetchOrdersFromDatabase()
        if (updatedOrders) {
          setOrderItems(updatedOrders)
          updateAvailableTickets(updatedOrders)
        }
      })
      .subscribe()

    // クリーンアップ関数
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // 利用可能なチケット番号を更新する関数
  const updateAvailableTickets = (orders: OrderItem[]) => {
    const usedTickets: AvailableTickets = {
      リンゴ: [],
      バナナ: []
    }

    orders.forEach((order) => {
      usedTickets[order.item].push(order.ticketNumber)
    })

    setAvailableTickets({
      リンゴ: Array.from({ length: TICKET_COUNT }, (_, i) => i + 1).filter(ticket => !usedTickets.リンゴ.includes(ticket)),
      バナナ: Array.from({ length: TICKET_COUNT }, (_, i) => i + 1).filter(ticket => !usedTickets.バナナ.includes(ticket))
    })
  }

  // Supabaseへのデータ追加関数
  const addOrderToDatabase = async (orderItems: OrderItem[]) => {
    const { data, error } = await supabase
      .from('orders')
      .insert(orderItems.map(orderItem => ({
        item: orderItem.item,
        price: orderItem.price,
        ticket_number: orderItem.ticketNumber,
        status: 'pending'
      })))

    if (error) {
      console.error('注文の追加に失敗しました:', error.message)
    }
  }

  // Supabaseからのデータ削除関数
  const removeOrderFromDatabase = async (id: number) => {
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('注文の削除に失敗しました:', error.message)
    }
  }

  // 次の利用可能なチケット番号を取得する関数
  const getNextAvailableTicket = (item: 'リンゴ' | 'バナナ'): number | null => {
    return availableTickets[item][0] || null
  }

  // 一時的に注文を追加する関数
  const addTempItem = (item: 'リンゴ' | 'バナナ', price: number) => {
    const ticketNumber = getNextAvailableTicket(item)
    if (ticketNumber !== null) {
      const newItem: OrderItem = { id: Date.now(), item, price, ticketNumber }
      setTempOrderItems([...tempOrderItems, newItem])
      setAvailableTickets(prev => ({
        ...prev,
        [item]: prev[item].filter(t => t !== ticketNumber)
      }))
    } else {
      alert(`${item}の札が不足しています。`)
    }
  }

  // 注文を確定する関数
  const confirmOrder = async () => {
    await addOrderToDatabase(tempOrderItems)
    const updatedOrders = await fetchOrdersFromDatabase()
    setOrderItems(updatedOrders)
    updateAvailableTickets(updatedOrders)
    setTempOrderItems([])
  }

  // アイテムを削除する関数
  const removeItem = async (id: number) => {
    await removeOrderFromDatabase(id)
    const updatedOrders = await fetchOrdersFromDatabase()
    setOrderItems(updatedOrders)
    updateAvailableTickets(updatedOrders)
  }

  // 仮の注文をクリアする関数
  const clearTempOrder = () => {
    tempOrderItems.forEach(item => {
      if (item.item === 'リンゴ' || item.item === 'バナナ') {
        setAvailableTickets(prev => ({
          ...prev,
          [item.item]: [...prev[item.item], item.ticketNumber].sort((a, b) => a - b)
        }))
      }
    })
    setTempOrderItems([])
  }

  // 仮の合計を計算する副作用
  useEffect(() => {
    const newTempTotal = tempOrderItems.reduce((sum, item) => sum + item.price, 0)
    setTempTotal(newTempTotal)
  }, [tempOrderItems])

  // 注文入力セクションのコンポーネント
  const OrderSection = () => (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">注文入力</h2>
      </div>
      <div className="card-content">
        <div className="button-group">
          <button onClick={() => addTempItem('リンゴ', 350)} className='apple'>リンゴ ¥350</button>
          <button onClick={() => addTempItem('バナナ', 200)} className='banana'>バナナ ¥200</button>
        </div>
        <div className="item-list">
          {tempOrderItems.map((item) => (
            <div key={item.id} className="item">
              <span>
                {item.item} #{item.ticketNumber}
              </span>
              <span>¥{item.price}</span>
            </div>
          ))}
        </div>
        <div className="total">
          <span>仮合計</span>
          <span>¥{tempTotal}</span>
        </div>
        <button 
          className="confirm-button" 
          onClick={confirmOrder} 
          disabled={tempOrderItems.length === 0}
        >
          注文を確定
        </button>
        <button 
          className="clear-button" 
          onClick={clearTempOrder}
        >
          注文をクリア
        </button>
      </div>
    </div>
  )

  // 調理状況セクションのコンポーネント
  const KitchenSection = () => (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">調理状況</h2>
      </div>
      <div className="kitchen-total">
          <span>調理中: {orderItems.length}</span>
      </div>
      <div className="card-content">
        {orderItems.map((item) => (
          <div
            key={item.id}
            className={`kitchen-item ${item.item === 'リンゴ' ? 'apple' : 'banana'}`}
          >
            <span>
              {item.item} #{item.ticketNumber}
            </span>
            <div>
              <button className="serve-button" onClick={() => removeItem(item.id)}>
                渡す
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="order-management">
      <OrderSection />
      <KitchenSection />
    </div>
  )
}
